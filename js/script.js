// =========================================
// 1. CONFIGURAÇÕES E URL
// =========================================
const URL_PLANILHA = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6gESmXXG_DWa-kT71etCA6zBdgp1tkSG94JG6_qfoJkNEFBuctf1wCUIFxhC7_-Q0HlOW5FGaPiOP/pub?gid=616431703&single=true&output=csv";

var initialBounds = [[-18, -60], [10, -30]];

// =========================================
// CORES DOS TERRITÓRIOS
// =========================================
const CORES_TERRITORIOS = {
    "VALE DO RIO SAMBITO": "#C45E4780",
    "CHAPADA VALE DO ITAIM": "#FFCFE880",
    "ENTRE-RIOS": "#75C9FF80",
    "VALE DOS RIOS PIAUÍ E ITAUEIRAS": "#BC81BD80",
    "VALE DO RIO GUARIBAS": "#296DB580",
    "SERRA DA CAPIVARA": "#B2DD6C80",
    "VALE DO RIO CANINDÉ": "#D7D7D780",
    "PLANÍCIE LITORÂNEA": "#F5F5F515",
    "CARNAUBAIS": "#F5F5F515",
    "TABULEIRO DO ALTO PARNAÍBA": "#F5F5F515",
    "CHAPADA DAS MANGABEIRAS": "#F5F5F515"
};

const camadasBase = {
    "mapa": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        maxZoom: 21, 
        maxNativeZoom: 19, 
        attribution: '© OpenStreetMap | Dev: Lucas Mendes' 
    }),
    "satelite": L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 21, 
        maxNativeZoom: 20,
        subdomains: ['mt0','mt1','mt2','mt3'],
        attribution: '© Google Satélite | Dev: Lucas Mendes'
    })
};

const map = L.map('map', {
    zoomControl: false, 
    maxZoom: 21, 
    minZoom: 6,
    maxBounds: initialBounds, 
    maxBoundsViscosity: 1.0,
    layers: [camadasBase.mapa] 
}).fitBounds([[-12.5, -45.5], [-2.5, -40.5]]);

window.clusterPontos = L.markerClusterGroup({ 
    maxClusterRadius: 25,
    disableClusteringAtZoom: 40,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true
});
map.addLayer(window.clusterPontos);

// =========================================
// 2. FUNÇÃO PARA SORTEIO DE PONTOS (COM VALIDAÇÃO E BUFFER DE 2KM)
// =========================================
function gerarPontoNoMunicipio(municipioFeature) {
    // Se o turf não carregou, usa método simplificado
    if (typeof turf === 'undefined') {
        console.warn("Turf.js não disponível. Usando centróide do município.");
        const bounds = L.geoJSON(municipioFeature).getBounds();
        return [bounds.getCenter().lat, bounds.getCenter().lng];
    }

    try {
        // Cria um buffer NEGATIVO de -2km
        // Isso garante que o ponto fique 2km dentro do limite
        const poligonoOriginal = municipioFeature.geometry ? municipioFeature : municipioFeature.geometry;
        const poligonoComBuffer = turf.buffer(poligonoOriginal, -1, { units: 'kilometers' });
        
        // Se o buffer negativo resultar em null ou polígono vazio, usa o original
        if (!poligonoComBuffer || !poligonoComBuffer.geometry) {
            console.warn("Município muito pequeno para buffer de 2km. Usando polígono original.");
            return gerarPontoSemBuffer(municipioFeature);
        }

        // Pega os bounds do polígono com buffer
        const bounds = turf.bbox(poligonoComBuffer);
        const [west, south, east, north] = bounds;
        
        let lat, lng, pontoValido = false;
        let tentativas = 0;
        const maxTentativas = 100;

        // Tenta até 100 vezes encontrar um ponto DENTRO do polígono com buffer
        while (!pontoValido && tentativas < maxTentativas) {
            lat = south + Math.random() * (north - south);
            lng = west + Math.random() * (east - west);
            
            const pontoSorteado = turf.point([lng, lat]);
            
            if (turf.booleanPointInPolygon(pontoSorteado, poligonoComBuffer)) {
                pontoValido = true;
            }
            tentativas++;
        }

        // Se não encontrou ponto válido após 100 tentativas, tenta sem buffer
        if (!pontoValido) {
            console.warn("Não foi possível gerar ponto com buffer. Tentando sem buffer...");
            return gerarPontoSemBuffer(municipioFeature);
        }

        return [lat, lng];
    } catch (erro) {
        console.error("Erro ao gerar ponto:", erro);
        return gerarPontoSemBuffer(municipioFeature);
    }
}

// Função auxiliar para gerar ponto sem buffer (fallback)
function gerarPontoSemBuffer(municipioFeature) {
    if (typeof turf === 'undefined') {
        const bounds = L.geoJSON(municipioFeature).getBounds();
        return [bounds.getCenter().lat, bounds.getCenter().lng];
    }

    try {
        const poligonoOriginal = municipioFeature.geometry ? municipioFeature : municipioFeature.geometry;
        const bounds = turf.bbox(poligonoOriginal);
        const [west, south, east, north] = bounds;
        
        let lat, lng, pontoValido = false;
        let tentativas = 0;

        while (!pontoValido && tentativas < 100) {
            lat = south + Math.random() * (north - south);
            lng = west + Math.random() * (east - west);
            
            const pontoSorteado = turf.point([lng, lat]);
            
            if (turf.booleanPointInPolygon(pontoSorteado, poligonoOriginal)) {
                pontoValido = true;
            }
            tentativas++;
        }

        if (!pontoValido) {
            // Retorna centróide como último recurso
            const bounds = L.geoJSON(municipioFeature).getBounds();
            return [bounds.getCenter().lat, bounds.getCenter().lng];
        }

        return [lat, lng];
    } catch (erro) {
        console.error("Erro crítico ao gerar ponto:", erro);
        const bounds = L.geoJSON(municipioFeature).getBounds();
        return [bounds.getCenter().lat, bounds.getCenter().lng];
    }
}

// =========================================
// 3. CARREGAMENTO E TRATAMENTO DE DADOS
// =========================================

Promise.all([
    fetch('data/municipios.geojson').then(res => res.json()),
    fetch('data/municipio_territorio.geojson').then(res => res.json()),
    fetch(URL_PLANILHA).then(res => res.text())
]).then(([municipiosData, territoriosData, csvText]) => {
    
    // CAMADA INVISÍVEL para lógica de pontos (municipios.geojson)
    window.dadosGlobais = { municipios: municipiosData };
    L.geoJSON(municipiosData, {
        style: { color: 'transparent', weight: 0, fillOpacity: 0, interactive: false }
    }).addTo(map);

    // CAMADA COLORIDA visível (municipio_territorio.geojson)
    L.geoJSON(territoriosData, {
        style: function(feature) {
            const territorio = feature.properties.Territóri || feature.properties.Território || feature.properties.TERRITORIO || "";
            const cor = CORES_TERRITORIOS[territorio.trim()] || "#F5F5F515";
            
            return {
                color: '#999',
                weight: 0.5,
                fillColor: cor,
                fillOpacity: 1,
                interactive: false
            };
        }
    }).addTo(map);

    Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: function(results) {
            // Função para iniciar o processamento
            const processar = () => {
                window.dadosCompletos = results.data.filter((item) => {
                    const lat = item.Latitude ? item.Latitude.toString().trim() : "";
                    const lng = item.Longitude ? item.Longitude.toString().trim() : "";
                    const ibge = item.cod_ibge ? item.cod_ibge.toString().trim() : "";
                    
                    const temCoordenada = lat !== "" && lng !== "" && lat !== "#REF!" && lng !== "#REF!";
                    const temIBGE = ibge !== "";

                    return temCoordenada || temIBGE;
                });

                renderizarPontos(window.dadosCompletos);
                inicializarFiltrosDinamicos();
            };

            // Se o Turf ainda não carregou, espera 300ms e tenta de novo
            if (typeof turf === 'undefined') {
                console.log("Aguardando Turf.js para processamento preciso...");
                setTimeout(processar, 300);
            } else {
                processar();
            }
        }
    });

}).catch(err => console.error("Erro ao carregar dados:", err));

// =========================================
// 4. RENDERIZAÇÃO DE PONTOS (COM NOVO AVISO)
// =========================================

function renderizarPontos(lista) {
    window.clusterPontos.clearLayers();
    window.todasObras = {}; 

    lista.forEach((item, index) => {
        const id = "item_" + index; 
        const status = item['Status da ação'] ? item['Status da ação'].trim() : "";
        
        let lat, lng;
        let ehLocalizacaoAproximada = false;

        // Tenta GPS primeiro
        if (item.Latitude && item.Longitude && item.Latitude !== "#REF!") {
            lat = parseFloat(item.Latitude.replace(',', '.'));
            lng = parseFloat(item.Longitude.replace(',', '.'));
        } 
        // Se não tiver GPS, usa o sorteio por Município
        else if (item.cod_ibge && window.dadosGlobais.municipios) {
            const munFeature = window.dadosGlobais.municipios.features.find(f => 
                String(f.properties["Código do IBGE"]) === String(item.cod_ibge)
            );
            if (munFeature) {
                const pontoSorteado = gerarPontoNoMunicipio(munFeature);
                lat = pontoSorteado[0];
                lng = pontoSorteado[1];
                ehLocalizacaoAproximada = true; 
            }
        }

        if (!isNaN(lat) && !isNaN(lng)) {
            window.todasObras[id] = item;

            let urlIcone = 'icones/icones_legendas/padrao.png';
            if (status === 'Não iniciado' || status === 'Contratado') {
                urlIcone = 'icones/icones_legendas/nao_iniciado.png';
            } else if (status === 'Em Execução' || status === 'Em execução') {
                urlIcone = 'icones/icones_legendas/em_execucao.png';
            } else if (status === 'Concluído' || status === 'Concluido') {
                urlIcone = 'icones/icones_legendas/concluido.png';
            }

            const marker = L.marker([lat, lng], { icon: L.icon({
                iconUrl: urlIcone,
                iconSize: [25, 35],
                iconAnchor: [12, 35],
                popupAnchor: [0, -35]
            })});

            // NOVO TEXTO DE AVISO
            const avisoAproximado = ehLocalizacaoAproximada 
                ? `<div style="background: #fff3cd; color: #856404; font-size: 10px; padding: 5px; border-radius: 4px; margin-bottom: 8px; border: 1px solid #ffeeba;">
                    ⚠️ Localização aproximada (Gerada Aleatória)
                   </div>` 
                : "";

            let htmlPopup = `
                <div style="min-width:200px">
                    ${avisoAproximado}
                    <h4 style="color:#0352AA; margin-bottom:5px;">${item.Ação}</h4>
                    <p style="font-size:12px"><b>Município:</b> ${item.Município}</p>
                    <p style="font-size:12px"><b>Status:</b> ${status}</p>
                    <button class="btn-ver-mais" onclick="window.abrirDetalhesSidebar('${id}')" style="cursor:pointer; background:#0352AA; color:white; border:none; padding:5px 10px; border-radius:4px; margin-top:5px; width:100%;">Ver Detalhes</button>
                </div>`;
            
            marker.bindPopup(htmlPopup);
            window.clusterPontos.addLayer(marker);
        }
    });
}

// =========================================
// 5. SIDEBAR (DETALHES ORIGINAL)
// =========================================

window.abrirDetalhesSidebar = function(id) {
    const p = window.todasObras[id];
    const docPai = window.parent.document;
    const divConteudo = docPai.getElementById('conteudo-detalhes');
    
    docPai.getElementById('sidebar-container').classList.remove('closed');
    docPai.querySelector('[data-target="panel-obras"]').click();

    const descartar = ["ID","cod_ibge","CD_MUN","Evidência (link)", "Data da atualizaçao", "Responsável pelo preenchimento da informação", "Fonte das informações", "Observações / Riscos / Pendências", "Latitude", "Longitude"];

    let html = `<h3>${p.Ação}</h3>`;
    
    let percVal = "0";
    if (p['% Meta Física Executada']) {
        percVal = p['% Meta Física Executada'].toString().replace('%', '').replace(',', '.');
    }
    const perc = parseFloat(percVal) || 0;
    
    html += `
        <div class="detalhe-item">
            <strong>Execução Física (Meta)</strong>
            <div class="progress-container" style="background:#eee; border-radius:10px; height:10px; margin:5px 0;">
                <div class="progress-bar" style="width: ${perc}%; background:#28a745; height:100%; border-radius:10px;"></div>
            </div>
            <span style="font-size:11px">${p['% Meta Física Executada'] || '0%'} concluído</span>
        </div>
    `;

    for (let key in p) {
        if (!descartar.includes(key) && p[key] !== "") {
            html += `<div class="detalhe-item"><strong>${key}</strong><span>${p[key]}</span></div>`;
        }
    }

    divConteudo.innerHTML = html;
};

// =========================================
// 6. FILTROS DINÂMICOS
// =========================================

function inicializarFiltrosDinamicos() {
    const getUnique = (col) => {
        const valores = window.dadosCompletos.map(d => d[col] ? d[col].trim() : "");
        return [...new Set(valores)].filter(x => x !== "").sort();
    };

    preencherSelect('filtro-orgao', getUnique('Órgão Executor'));
    preencherSelect('filtro-acao', getUnique('Ação'));
    preencherSelect('filtro-tipo-acao', getUnique('Tipo de Ação'));
    preencherSelect('filtro-municipio', getUnique('Município'));
    preencherSelect('filtro-comunidade', getUnique('Comunidade/ Localidade'));
    preencherSelect('filtro-territorio', getUnique('Território'));
    preencherSelect('filtro-componente', getUnique('Componente'));
    preencherSelect('filtro-status', getUnique('Status da ação'));
    preencherSelect('filtro-tradicional', getUnique('Povos de comunidades tradicionais'));
    preencherSelect('filtro-genero', getUnique('Gênero')); 

    if (window.parent.iniciarSlimSelect) window.parent.iniciarSlimSelect();
}

function preencherSelect(id, lista) {
    const el = window.parent.document.getElementById(id);
    if (!el) return;
    el.innerHTML = "";
    lista.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.text = val;
        el.appendChild(opt);
    });
}

// Lógica de Filtragem Multicritério
window.parent.aplicarFiltros = function() {
    const docPai = window.parent.document;
    const getS = (id) => {
        const el = docPai.getElementById(id);
        return el ? Array.from(el.selectedOptions).map(o => o.value) : [];
    };

    const filtrosAtivos = {
        'Órgão Executor': getS('filtro-orgao'),
        'Ação': getS('filtro-acao'),
        'Tipo de Ação': getS('filtro-tipo-acao'),
        'Município': getS('filtro-municipio'),
        'Comunidade/ Localidade': getS('filtro-comunidade'),
        'Território': getS('filtro-territorio'),
        'Componente': getS('filtro-componente'),
        'Status da ação': getS('filtro-status'),
        'Povos de comunidades tradicionais': getS('filtro-tradicional'),
        'Gênero': getS('filtro-genero')
    };

    const filtrados = window.dadosCompletos.filter(item => {
        return Object.keys(filtrosAtivos).every(chave => {
            const selecao = filtrosAtivos[chave];
            const valorItem = item[chave] ? item[chave].trim() : "";
            return selecao.length === 0 || selecao.includes(valorItem);
        });
    });

    renderizarPontos(filtrados);
    
    if(window.innerWidth <= 600) {
        docPai.getElementById('sidebar-container').classList.add('closed');
    }
};

window.trocarCamadaBase = function(tipo) {
    if (tipo === 'satelite') {
        map.removeLayer(camadasBase.mapa);
        camadasBase.satelite.addTo(map);
    } else {
        map.removeLayer(camadasBase.satelite);
        camadasBase.mapa.addTo(map);
    }
};
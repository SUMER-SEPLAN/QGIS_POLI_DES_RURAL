// =========================================
// 1. CONFIGURAÇÕES E URL
// =========================================
const URL_PLANILHA = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR53uLoqV39Zf9M0eP7yFf235VWo3ke9yHEZGhIrsEDlJKauvPxvMiIhppIu6RVLUhSWpOwLWOlY7hY/pub?gid=1458311235&single=true&output=csv";

var initialBounds = [[-18, -60], [10, -30]];

// Controle de cota de pontos por município (Dicionário)
window.contadorMunicipios = {};

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
// 2. FUNÇÃO PARA SORTEIO DE PONTOS (BACKUP DE EMERGÊNCIA)
// =========================================
function gerarPontoNoMunicipio(municipioFeature) {
    if (typeof turf === 'undefined') {
        const bounds = L.geoJSON(municipioFeature).getBounds();
        return [bounds.getCenter().lat, bounds.getCenter().lng];
    }

    try {
        const poligonoOriginal = municipioFeature.geometry ? municipioFeature : municipioFeature.geometry;
        const poligonoComBuffer = turf.buffer(poligonoOriginal, -1, { units: 'kilometers' });
        
        if (!poligonoComBuffer || !poligonoComBuffer.geometry) {
            return gerarPontoSemBuffer(municipioFeature);
        }

        const bounds = turf.bbox(poligonoComBuffer);
        const [west, south, east, north] = bounds;
        
        let lat, lng, pontoValido = false;
        let tentativas = 0;
        const maxTentativas = 100;

        while (!pontoValido && tentativas < maxTentativas) {
            lat = south + Math.random() * (north - south);
            lng = west + Math.random() * (east - west);
            const pontoSorteado = turf.point([lng, lat]);
            if (turf.booleanPointInPolygon(pontoSorteado, poligonoComBuffer)) {
                pontoValido = true;
            }
            tentativas++;
        }

        if (!pontoValido) return gerarPontoSemBuffer(municipioFeature);
        return [lat, lng];
    } catch (erro) {
        return gerarPontoSemBuffer(municipioFeature);
    }
}

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
            const bounds = L.geoJSON(municipioFeature).getBounds();
            return [bounds.getCenter().lat, bounds.getCenter().lng];
        }
        return [lat, lng];
    } catch (erro) {
        const bounds = L.geoJSON(municipioFeature).getBounds();
        return [bounds.getCenter().lat, bounds.getCenter().lng];
    }
}

// Função para validar se a string é uma coordenada decimal limpa
function ehCoordenadaValida(coordStr) {
    if (!coordStr) return false;
    const limpo = coordStr.toString().trim();
    const regex = /^-?\d+[\.,]\d+$/; 
    return regex.test(limpo);
}

// =========================================
// 3. CARREGAMENTO E TRATAMENTO DE DADOS
// =========================================

Promise.all([
    fetch('data/municipios.geojson').then(res => res.json()),
    fetch('data/municipio_territorio.geojson').then(res => res.json()),
    fetch(URL_PLANILHA).then(res => res.text())
]).then(([municipiosData, territoriosData, csvText]) => {
    
    // CAMADA INVISÍVEL para lógica de pontos (backup)
    window.dadosGlobais = { municipios: municipiosData };
    L.geoJSON(municipiosData, {
        style: { color: 'transparent', weight: 0, fillOpacity: 0, interactive: false }
    }).addTo(map);

    // CAMADA COLORIDA (municipio_territorio.geojson) - USADA PARA A BUSCA
    const camadaTerritorios = L.geoJSON(territoriosData, {
        style: function(feature) {
            const territorio = feature.properties.Territóri || feature.properties.Território || feature.properties.TERRITORIO || "";
            const cor = CORES_TERRITORIOS[territorio.trim()] || "#F5F5F515";
            
            return {
                color: '#999',
                weight: 0.5,
                fillColor: cor,
                fillOpacity: 1,
                interactive: true 
            };
        }
    }).addTo(map);

    // ATIVAÇÃO DA BUSCA
    configurarBuscaMunicipios(camadaTerritorios);

    Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: function(results) {
            const processar = () => {
                window.dadosCompletos = results.data.filter((item) => {
                    const lat = item.Latitude ? item.Latitude.toString().trim() : "";
                    const lng = item.Longitude ? item.Longitude.toString().trim() : "";
                    const codMun = item["Código do município"] ? item["Código do município"].toString().trim() : "";
                    
                    const temCoordenada = ehCoordenadaValida(lat) && ehCoordenadaValida(lng);
                    const temCodigo = codMun !== "";

                    return temCoordenada || temCodigo;
                });

                renderizarPontos(window.dadosCompletos);
                inicializarFiltrosDinamicos();
            };

            if (typeof turf === 'undefined') {
                setTimeout(processar, 300);
            } else {
                processar();
            }
        }
    });

}).catch(err => console.error("Erro ao carregar dados:", err));

// =========================================
// FUNÇÃO DE BUSCA E EFEITO VISUAL
// =========================================

let searchControl;

function configurarBuscaMunicipios(camada) {
    searchControl = new L.Control.Search({
        layer: camada,
        propertyName: 'NM_MUN', 
        marker: false,
        textPlaceholder: 'Buscar município...',
        autoCollapse: false,
        minLength: 1,
        initial: false,
        moveToLocation: function(latlng, title, map) {
            const layers = camada.getLayers();
            const layerAlvo = layers.find(l => {
                const nome = l.feature.properties.NM_MUN;
                return nome && nome.toString().toUpperCase() === title.toUpperCase();
            });

            if (layerAlvo) {
                map.fitBounds(layerAlvo.getBounds(), { padding: [40, 40] });

                let piscadas = 0;
                const terrNome = layerAlvo.feature.properties.Territóri || layerAlvo.feature.properties.Território || "";
                const corOriginal = CORES_TERRITORIOS[terrNome.trim()] || "#F5F5F515";

                const estiloOriginal = { fillColor: corOriginal, fillOpacity: 1, weight: 0.5, color: '#999' };
                const estiloDestaque = { fillColor: '#ffff00', fillOpacity: 0.8, color: '#007bff', weight: 6 };

                const intervalo = setInterval(() => {
                    layerAlvo.setStyle(piscadas % 2 === 0 ? estiloDestaque : estiloOriginal);
                    piscadas++;
                    if (piscadas > 5) {
                        clearInterval(intervalo);
                        layerAlvo.setStyle(estiloOriginal);
                    }
                }, 400); 
            }
        },
        filterData: function(text, records) {
            var jsons = {};
            var textClean = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            for(var key in records) {
                var keyClean = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                if(keyClean.indexOf(textClean) > -1 ) {
                    jsons[key] = records[key];
                }
            }
            return jsons;
        }
    });
    map.addControl(searchControl);
}

// =========================================
// DEFINIÇÃO DE ÍCONES DINÂMICOS (.SVG)
// =========================================
function definirIcone(acao, status) {
    const acaoNormalizada = acao ? acao.trim().toLowerCase() : "";
    const statusNormalizado = status ? status.trim().toLowerCase() : "";

    let prefixoAcao = "padrao";
    
    if (acaoNormalizada.includes("reforma da nova sede da seplan")) {
        prefixoAcao = "reforma_da_nova_sede_da_seplan";
    } else if (acaoNormalizada.includes("construção de passagem molhada")) {
        prefixoAcao = "construcao_de_passagem_molhada";
    } else if (acaoNormalizada.includes("cisterna")) {
        prefixoAcao = "cisterna";
    } else if (acaoNormalizada === "pap") {
        prefixoAcao = "pap";
    } else if (acaoNormalizada.includes("estações meteorológicas")) {
        prefixoAcao = "estacoes_meteorologicas";
    } else if (acaoNormalizada.includes("equipamentos de informática")) {
        prefixoAcao = "equipamentos_de_informatica";
    } else if (acaoNormalizada.includes("campanha de educação ambiental")) {
        prefixoAcao = "campanha_de_educacao_ambiental";
    } else if (acaoNormalizada.includes("curso em meio ambiente")) {
        prefixoAcao = "curso_em_meio_ambiente_para_jovens";
    } else if (acaoNormalizada.includes("regularização fundiária")) {
        prefixoAcao = "regurarizacao_fundiaria";
    } else if (acaoNormalizada.includes("reforma das unidades regionais")) {
        prefixoAcao = "reforma_das_unidades_regionais"; 
    } else if (acaoNormalizada.includes("regularização ambiental rural")) {
        // NOVA AÇÃO ADICIONADA AQUI
        prefixoAcao = "regularizacao_ambiental_rural"; 
    }

    let sufixoStatus = "sem_status";
    if (statusNormalizado === "concluído" || statusNormalizado === "concluido") {
        sufixoStatus = "concluido";
    } else if (statusNormalizado === "em execução" || statusNormalizado === "em execucao") {
        sufixoStatus = "em_execucao";
    } else if (statusNormalizado === "não iniciado" || statusNormalizado === "contratado") {
        sufixoStatus = "nao_iniciado";
    }

    return `icones/icones_camadas/${prefixoAcao}_${sufixoStatus}.svg`; 
}

// =========================================
// 4. RENDERIZAÇÃO DE PONTOS (COM DICIONÁRIO E BACKUP)
// =========================================

function renderizarPontos(lista) {
    window.clusterPontos.clearLayers();
    window.todasObras = {}; 
    
    // Zera os contadores sempre que os pontos forem re-renderizados (ex: nos filtros)
    window.contadorMunicipios = {}; 

    lista.forEach((item, index) => {
        const id = "item_" + index; 
        const status = item['Status da ação'] ? item['Status da ação'].trim() : "";
        const acaoItem = item['Ação'] ? item['Ação'].trim() : "";
        
        let lat, lng;
        let ehLocalizacaoAproximada = false;
        let pontoEncontrado = false;

        const strLat = item.Latitude ? item.Latitude.toString().trim() : "";
        const strLng = item.Longitude ? item.Longitude.toString().trim() : "";

        // 1. TENTA GPS PRIMEIRO
        if (ehCoordenadaValida(strLat) && ehCoordenadaValida(strLng)) {
            lat = parseFloat(strLat.replace(',', '.'));
            lng = parseFloat(strLng.replace(',', '.'));
            pontoEncontrado = true;
        } 
        // 2. TENTA USAR O DICIONÁRIO DE COORDENADAS PRÉ-GERADAS (MUITO RÁPIDO)
        else if (item["Código do município"]) {
            let codMun = item["Código do município"].toString().trim();
            
            if (typeof DICIONARIO_COORDENADAS !== 'undefined' && DICIONARIO_COORDENADAS[codMun]) {
                if (window.contadorMunicipios[codMun] === undefined) {
                    window.contadorMunicipios[codMun] = 0;
                }

                let indiceAtual = window.contadorMunicipios[codMun];
                
                // Se ainda há coordenadas no estoque de 400
                if (indiceAtual < DICIONARIO_COORDENADAS[codMun].length) {
                    lat = DICIONARIO_COORDENADAS[codMun][indiceAtual][0];
                    lng = DICIONARIO_COORDENADAS[codMun][indiceAtual][1];
                    window.contadorMunicipios[codMun]++;
                    ehLocalizacaoAproximada = true;
                    pontoEncontrado = true;
                }
            }
            
            // 3. SE O DICIONÁRIO ACABOU OU FALHOU, USA TURF.JS (BACKUP SEGURO)
            if (!pontoEncontrado && window.dadosGlobais.municipios) {
                const munFeature = window.dadosGlobais.municipios.features.find(f => 
                    String(f.properties["Código do IBGE"]) === String(codMun)
                );
                if (munFeature) {
                    const pt = gerarPontoNoMunicipio(munFeature);
                    lat = pt[0];
                    lng = pt[1];
                    ehLocalizacaoAproximada = true;
                    pontoEncontrado = true;
                }
            }
        }

        if (pontoEncontrado && !isNaN(lat) && !isNaN(lng)) {
            window.todasObras[id] = item;

            const urlIcone = definirIcone(acaoItem, status);

            const marker = L.marker([lat, lng], { icon: L.icon({
                iconUrl: urlIcone,
                iconSize: [35, 35], 
                iconAnchor: [17, 35], 
                popupAnchor: [0, -35]
            })});

            const avisoAproximado = ehLocalizacaoAproximada 
                ? `<div style="background: #fff3cd; color: #856404; font-size: 10px; padding: 5px; border-radius: 4px; margin-bottom: 8px; border: 1px solid #ffeeba;">
                    ⚠️ Localização aproximada (Gerada Aleatória)
                   </div>` 
                : "";

            let htmlPopup = `
                <div style="min-width:200px">
                    ${avisoAproximado}
                    <h4 style="color:#0352AA; margin-bottom:5px;">${acaoItem}</h4>
                    <p style="font-size:12px"><b>Município:</b> ${item.Município}</p>
                    <button class="btn-ver-mais" onclick="window.abrirDetalhesSidebar('${id}')" style="cursor:pointer; background:#0352AA; color:white; border:none; padding:5px 10px; border-radius:4px; margin-top:5px; width:100%;">Ver Detalhes</button>
                </div>`;
            
            marker.bindPopup(htmlPopup);
            window.clusterPontos.addLayer(marker);
        }
    });
}

// =========================================
// 5. SIDEBAR E DETALHES
// =========================================

window.abrirDetalhesSidebar = function(id) {
    const p = window.todasObras[id];
    const docPai = window.parent.document;
    const divConteudo = docPai.getElementById('conteudo-detalhes');
    
    docPai.getElementById('sidebar-container').classList.remove('closed');
    docPai.querySelector('[data-target="panel-obras"]').click();

    const descartar = ["ID","Código do município","Subcomponente/ Subproduto","Data de Ordem de serviço","Vigência de execution do contrato","Meta Física Planejada","Meta Física Executada","Evidência (link)", "CPF", "Data da atualizaçao", "Responsável pelo preenchimento da informação", "Fonte das informações", "Observações / Riscos / Pendências", "Latitude", "Longitude"];

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
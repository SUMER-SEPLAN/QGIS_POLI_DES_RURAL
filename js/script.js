// =========================================
// 1. CONFIGURAÇÕES E URL
// =========================================
const URL_API_GOOGLE = "https://script.google.com/macros/s/AKfycbxvpemxXi-oRZhfTLliEscy2GYy-7ngK3qaiIavocnu6UgzkhruCroB2Lo4H-NulKjgUQ/exec";

var initialBounds = [[-18, -60], [10, -30]];
window.contadorMunicipios = {};
var searchControl;

const CORES_TERRITORIOS = {
    "VALE DO RIO SAMBITO": "#C45E4780", "CHAPADA VALE DO ITAIM": "#FFCFE880", "ENTRE-RIOS": "#75C9FF80",
    "VALE DOS RIOS PIAUÍ E ITAUEIRAS": "#BC81BD80", "VALE DO RIO GUARIBAS": "#296DB580", "SERRA DA CAPIVARA": "#B2DD6C80",
    "VALE DO RIO CANINDÉ": "#D7D7D780", "PLANÍCIE LITORÂNEA": "#F5F5F515", "CARNAUBAIS": "#F5F5F515",
    "TABULEIRO DO ALTO PARNAÍBA": "#F5F5F515", "CHAPADA DAS MANGABEIRAS": "#F5F5F515"
};

const camadasBase = {
    "mapa": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, maxNativeZoom: 19, attribution: '© OpenStreetMap' }),
    "satelite": L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 21, maxNativeZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google Satélite' })
};

const map = L.map('map', {
    zoomControl: false, maxZoom: 21, minZoom: 6, maxBounds: initialBounds, maxBoundsViscosity: 1.0, layers: [camadasBase.mapa] 
}).fitBounds([[-12.5, -45.5], [-2.5, -40.5]]);

window.clusterPontos = L.markerClusterGroup({ maxClusterRadius: 25, disableClusteringAtZoom: 40, showCoverageOnHover: false, spiderfyOnMaxZoom: true });
map.addLayer(window.clusterPontos);

// =========================================
// 2. FUNÇÕES BASE (Conversor e Ícones)
// =========================================
function parseCoordenada(coordStr) {
    if (!coordStr || coordStr === "#REF!") return null;
    let str = coordStr.toString().trim().toUpperCase().replace(/,/g, '.');
    
    // CORREÇÃO: Validação limpa que não causa erro no VS Code
    if (!isNaN(str) && str !== "") return parseFloat(str);

    const numeros = str.match(/\d+(?:\.\d+)?/g);
    if (!numeros || numeros.length < 2) return null;

    let graus = parseFloat(numeros[0]) || 0;
    let minutos = parseFloat(numeros[1]) || 0;
    let segundos = numeros.length > 2 ? parseFloat(numeros[2]) : 0;
    let decimal = graus + (minutos / 60) + (segundos / 3600);

    if (str.includes('S') || str.includes('W') || str.includes('O') || str.startsWith('-')) decimal = Math.abs(decimal) * -1;
    else if (str.includes('N') || str.includes('E') || str.includes('L')) decimal = Math.abs(decimal);

    return isNaN(decimal) ? null : decimal;
}

function definirIcone(acao, tipoContratacao, status) {
    const acaoNormalizada = acao ? acao.trim().toLowerCase() : "";
    const tipoNormalizado = tipoContratacao ? tipoContratacao.trim().toLowerCase() : "";
    const statusNormalizado = status ? status.trim().toLowerCase() : "";

    let prefixoAcao = "generico";
    
    if (acaoNormalizada.includes("reforma da nova sede da seplan") || tipoNormalizado === "obra") {
        prefixoAcao = "reforma_da_nova_sede_da_seplan";
    } else if (acaoNormalizada.includes("passagem molhada") || tipoNormalizado.includes("mobilidade rural")) { 
        prefixoAcao = "construcao_de_passagem_molhada"; 
    } else if (acaoNormalizada.includes("cisterna") || acaoNormalizada.includes("águas cinzas") || tipoNormalizado.includes("tecnologia social")) {
        prefixoAcao = "cisterna";
    } else if (acaoNormalizada === "pap" || acaoNormalizada === "pn" || tipoNormalizado.includes("projeto produtivo") || tipoNormalizado.includes("plano de negócios")) {
        prefixoAcao = "pap";
    } else if (acaoNormalizada.includes("estações meteorológicas") || acaoNormalizada.includes("meteorológica")) {
        prefixoAcao = "estacoes_meteorologicas";
    } else if (acaoNormalizada.includes("equipamentos de informática") || acaoNormalizada.includes("microcomputadores") || tipoNormalizado === "bens") {
        prefixoAcao = "equipamentos_de_informatica";
    } else if (acaoNormalizada.includes("campanha de educação ambiental")) {
        prefixoAcao = "campanha_de_educacao_ambiental";
    } else if (acaoNormalizada.includes("curso em meio ambiente") || tipoNormalizado.includes("capacitação")) {
        prefixoAcao = "curso_em_meio_ambiente_para_jovens";
    } else if (acaoNormalizada.includes("regularização fundiária") || tipoNormalizado.includes("título de regularização")) {
        prefixoAcao = "regurarizacao_fundiaria";
    } else if (acaoNormalizada.includes("reforma das unidades regionais")) {
        prefixoAcao = "reforma_das_unidades_regionais"; 
    } else if (acaoNormalizada.includes("regularização ambiental rural") || tipoNormalizado.includes("car - ano")) {
        prefixoAcao = "regularizacao_ambiental_rural"; 
    }

    let sufixoStatus = "sem_status";
    if (statusNormalizado === "concluído" || statusNormalizado === "concluido") sufixoStatus = "concluido";
    else if (statusNormalizado === "em execução" || statusNormalizado === "em execucao") sufixoStatus = "em_execucao";
    else if (statusNormalizado === "não iniciado" || statusNormalizado === "contratado") sufixoStatus = "nao_iniciado";

    return `icones/icones_camadas/${prefixoAcao}_${sufixoStatus}.svg`; 
}

// =========================================
// 3. INICIALIZAÇÃO DE DADOS E EVENTOS
// =========================================

window.dadosGlobais = { municipios: municipiosData };
L.geoJSON(municipiosData, { style: { color: 'transparent', weight: 0, fillOpacity: 0, interactive: false } }).addTo(map);

const camadaTerritorios = L.geoJSON(territoriosData, {
    style: function(feature) {
        const territorio = feature.properties.Territóri || feature.properties.Território || feature.properties.TERRITORIO || "";
        const cor = CORES_TERRITORIOS[territorio.trim()] || "#F5F5F515";
        return { color: '#999', weight: 0.5, fillColor: cor, fillOpacity: 1, interactive: true };
    }
}).addTo(map);
configurarBuscaMunicipios(camadaTerritorios);

fetch(URL_API_GOOGLE)
    .then(response => response.text()) 
    .then(text => {
        try {
            const data = JSON.parse(text);
            
            window.dadosCompletos = data.filter((item) => {
                const latConvertida = parseCoordenada(item.Latitude);
                const lngConvertida = parseCoordenada(item.Longitude);
                const codMun = item["Código do município"] ? item["Código do município"].toString().trim() : "";
                
                return (latConvertida !== null && lngConvertida !== null) || codMun !== "";
            });

            window.renderizarPontos(window.dadosCompletos);
            inicializarFiltrosDinamicos();
            
        } catch (e) {
            console.error("Erro na leitura da API:", text);
        }
    })
    .catch(error => {
        console.error("Falha na conexão com a internet ou erro de rede:", error);
    });

// =========================================
// 4. RENDERIZAÇÃO DE PONTOS E BUSCA
// =========================================
function configurarBuscaMunicipios(camada) {
    searchControl = new L.Control.Search({
        layer: camada, propertyName: 'NM_MUN', marker: false, textPlaceholder: 'Buscar município...',
        autoCollapse: false, minLength: 1, initial: false,
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
                if(keyClean.indexOf(textClean) > -1 ) jsons[key] = records[key];
            }
            return jsons;
        }
    });
    map.addControl(searchControl);
}

window.renderizarPontos = function(lista) {
    window.clusterPontos.clearLayers();
    window.todasObras = {}; 
    window.contadorMunicipios = {}; 

    lista.forEach((item, index) => {
        const id = "item_" + index; 
        const status = item['Status da ação'] ? item['Status da ação'].trim() : "";
        const acaoItem = item['Objeto'] ? item['Objeto'].trim() : "";
        const tipoContratacao = item['Tipo de contratação'] ? item['Tipo de contratação'].trim() : "";
        
        let lat, lng;
        let ehLocalizacaoAproximada = false;
        let pontoEncontrado = false;

        const latConvertida = parseCoordenada(item.Latitude);
        const lngConvertida = parseCoordenada(item.Longitude);

        if (latConvertida !== null && lngConvertida !== null) {
            lat = latConvertida;
            lng = lngConvertida;
            pontoEncontrado = true;
        } 
        else if (item["Código do município"]) {
            let codMun = item["Código do município"].toString().trim();
            if (typeof DICIONARIO_COORDENADAS !== 'undefined' && DICIONARIO_COORDENADAS[codMun]) {
                if (window.contadorMunicipios[codMun] === undefined) window.contadorMunicipios[codMun] = 0;
                let indiceAtual = window.contadorMunicipios[codMun];
                
                if (indiceAtual < DICIONARIO_COORDENADAS[codMun].length) {
                    lat = DICIONARIO_COORDENADAS[codMun][indiceAtual][0];
                    lng = DICIONARIO_COORDENADAS[codMun][indiceAtual][1];
                    window.contadorMunicipios[codMun]++;
                    ehLocalizacaoAproximada = true;
                    pontoEncontrado = true;
                }
            }
        }

        if (pontoEncontrado && !isNaN(lat) && !isNaN(lng)) {
            window.todasObras[id] = item;
            
            const urlIcone = definirIcone(acaoItem, tipoContratacao, status);
            
            const marker = L.marker([lat, lng], { icon: L.icon({
                iconUrl: urlIcone, iconSize: [35, 35], iconAnchor: [17, 35], popupAnchor: [0, -35]
            })});

            const avisoAproximado = ehLocalizacaoAproximada 
                ? `<div style="background: #fff3cd; color: #856404; font-size: 10px; padding: 5px; border-radius: 4px; margin-bottom: 8px; border: 1px solid #ffeeba;">⚠️ Localização aproximada (Gerada Aleatória)</div>` : "";

            let htmlPopup = `<div style="min-width:200px">${avisoAproximado}<h4 style="color:#0352AA; margin-bottom:5px;">${acaoItem || 'Projeto Desconhecido'}</h4><p style="font-size:12px"><b>Município:</b> ${item.Município}</p><button class="btn-ver-mais" onclick="window.abrirDetalhesSidebar('${id}')" style="cursor:pointer; background:#0352AA; color:white; border:none; padding:5px 10px; border-radius:4px; margin-top:5px; width:100%;">Ver Detalhes</button></div>`;
            
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
    const divConteudo = document.getElementById('conteudo-detalhes');
    
    document.getElementById('sidebar-container').classList.remove('closed');
    document.querySelector('[data-target="panel-obras"]').click();

    const descartar = ["ID","Código do município","Subcomponente/ Subproduto","Data de Ordem de serviço","Vigência de execution do contrato","Evidência (link)", "CPF", "Data da atualizaçao", "Responsável pelo preenchimento da informação", "Fonte das informações", "Observações / Riscos / Pendências", "Latitude", "Longitude", "Objeto"];

    const tituloObra = p['Objeto'] ? p['Objeto'] : 'Ação Desconhecida';
    let html = `<h3>${tituloObra}</h3>`;
    
    let percVal = p['% Meta Física Executada'] ? p['% Meta Física Executada'].toString().replace('%', '').replace(',', '.') : "0";
    const perc = parseFloat(percVal) || 0;
    
    html += `<div class="detalhe-item"><strong>Execução Física (Meta)</strong><div class="progress-container" style="background:#eee; border-radius:10px; height:10px; margin:5px 0;"><div class="progress-bar" style="width: ${perc}%; background:#28a745; height:100%; border-radius:10px;"></div></div><span style="font-size:11px">${p['% Meta Física Executada'] || '0%'} concluído</span></div>`;

    for (let key in p) {
        if (!descartar.includes(key) && p[key] !== "") html += `<div class="detalhe-item"><strong>${key}</strong><span>${p[key]}</span></div>`;
    }
    divConteudo.innerHTML = html;
};

// =========================================
// 6. FILTROS DINÂMICOS E CONTROLES DE MAPA
// =========================================
function inicializarFiltrosDinamicos() {
    const getUnique = (col) => {
        const valores = window.dadosCompletos.map(d => d[col] ? d[col].trim() : "");
        return [...new Set(valores)].filter(x => x !== "").sort();
    };

    preencherSelect('filtro-orgao', getUnique('Órgão Executor'));
    preencherSelect('filtro-acao', getUnique('Objeto'));
    preencherSelect('filtro-tipo-acao', getUnique('Tipo de contratação'));
    preencherSelect('filtro-municipio', getUnique('Município'));
    preencherSelect('filtro-comunidade', getUnique('Comunidade/ Localidade'));
    preencherSelect('filtro-territorio', getUnique('Território'));
    preencherSelect('filtro-componente', getUnique('Componente'));
    preencherSelect('filtro-status', getUnique('Status da ação'));
    preencherSelect('filtro-tradicional', getUnique('Povos de comunidades tradicionais'));
    preencherSelect('filtro-genero', getUnique('Gênero')); 

    if (window.iniciarSlimSelect) window.iniciarSlimSelect();
}

function preencherSelect(id, lista) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = "";
    lista.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.text = val;
        el.appendChild(opt);
    });
}

window.aplicarFiltros = function() {
    const getS = (id) => {
        const el = document.getElementById(id);
        return el ? Array.from(el.selectedOptions).map(o => o.value) : [];
    };

    const filtrosAtivos = {
        'Órgão Executor': getS('filtro-orgao'), 
        'Objeto': getS('filtro-acao'), 
        'Tipo de contratação': getS('filtro-tipo-acao'),
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
            if (selecao.length === 0) return true;
            
            const valorItem = item[chave] ? item[chave].trim() : "";
            return selecao.includes(valorItem);
        });
    });

    window.renderizarPontos(filtrados);
    if(window.innerWidth <= 600) document.getElementById('sidebar-container').classList.add('closed');
};

window.trocarCamadaBase = function(tipo) {
    document.querySelectorAll('.layer-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-' + tipo).classList.add('active');

    if (tipo === 'satelite') {
        map.removeLayer(camadasBase.mapa);
        camadasBase.satelite.addTo(map);
    } else {
        map.removeLayer(camadasBase.satelite);
        camadasBase.mapa.addTo(map);
    }
};
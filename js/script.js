// =========================================
// 1. CONFIGURAÇÕES E URL
// =========================================
const URL_PLANILHA = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6gESmXXG_DWa-kT71etCA6zBdgp1tkSG94JG6_qfoJkNEFBuctf1wCUIFxhC7_-Q0HlOW5FGaPiOP/pub?gid=616431703&single=true&output=csv";

var initialBounds = [[-18, -60], [10, -30]];

const camadasBase = {
    "mapa": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        maxZoom: 21, 
        maxNativeZoom: 19, 
        attribution: '© OpenStreetMap | Dev: Lucas Mendes' 
    }),
    "satelite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 21, 
        maxNativeZoom: 17,
        attribution: 'Tiles &copy; Esri | Dev: Lucas Mendes'
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
    maxClusterRadius: 40, 
    showCoverageOnHover: false 
});
map.addLayer(window.clusterPontos);

// =========================================
// 2. CARREGAMENTO E TRATAMENTO DE DADOS
// =========================================

Promise.all([
    fetch('data/municipios.geojson').then(res => res.json()),
    fetch(URL_PLANILHA).then(res => res.text())
]).then(([municipiosData, csvText]) => {
    
    // Renderiza o mapa de fundo (municípios)
    window.dadosGlobais = { municipios: municipiosData };
    L.geoJSON(municipiosData, {
        style: { color: '#ccc', weight: 1, fillOpacity: 0.05, interactive: false }
    }).addTo(map);

    // --- LEITURA DO CSV COM PAPAPARSE ---
    Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: function(results) {
            console.log("Linhas totais:", results.data.length);

            // Filtra apenas itens que têm Latitude e Longitude preenchidas
            window.dadosCompletos = results.data.filter((item) => {
                const lat = item.Latitude ? item.Latitude.toString().trim() : "";
                const lng = item.Longitude ? item.Longitude.toString().trim() : "";
                // Verifica se não está vazio e se não é erro de referência do Excel
                return lat !== "" && lng !== "" && lat !== "#REF!" && lng !== "#REF!";
            });

            console.log("Linhas válidas (com coordenadas):", window.dadosCompletos.length);
            
            renderizarPontos(window.dadosCompletos);
            inicializarFiltrosDinamicos();
        },
        error: function(err) {
            console.error("Erro no PapaParse:", err);
        }
    });

}).catch(err => console.error("Erro ao carregar dados:", err));

// =========================================
// 3. RENDERIZAÇÃO DE PONTOS
// =========================================

function renderizarPontos(lista) {
    window.clusterPontos.clearLayers();
    window.todasObras = {}; 

    lista.forEach((item, index) => {
        // Normaliza as coordenadas (troca vírgula por ponto)
        const lat = parseFloat(item.Latitude.replace(',', '.'));
        const lng = parseFloat(item.Longitude.replace(',', '.'));
        const id = "item_" + index; 
        
        // Pega o status, remove espaços e trata vazio
        const status = item['Status da ação'] ? item['Status da ação'].trim() : "";

        // Se coordenadas forem números válidos, cria o marcador
        if (!isNaN(lat) && !isNaN(lng)) {
            window.todasObras[id] = item;

            // --- LÓGICA DE ÍCONES (CORRIGIDA) ---
            let urlIcone = 'icones/icones_legendas/padrao.png'; // Fallback

            // Comparações de status
            if (status === 'Não iniciado' || status === 'Contratado') {
                // "Contratado" na planilha vira ícone de "Não iniciado" visualmente
                urlIcone = 'icones/icones_legendas/nao_iniciado.png';
            } 
            else if (status === 'Em Execução' || status === 'Em execução') {
                urlIcone = 'icones/icones_legendas/em_execucao.png';
            } 
            else if (status === 'Concluído' || status === 'Concluido') {
                urlIcone = 'icones/icones_legendas/concluido.png';
            }

            const customIcon = L.icon({
                iconUrl: urlIcone,
                iconSize: [25, 35],
                iconAnchor: [12, 35],
                popupAnchor: [0, -35]
            });

            const marker = L.marker([lat, lng], { icon: customIcon });

            let htmlPopup = `
                <div style="min-width:200px">
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
// 4. SIDEBAR (DETALHES)
// =========================================

window.abrirDetalhesSidebar = function(id) {
    const p = window.todasObras[id];
    const docPai = window.parent.document;
    const divConteudo = docPai.getElementById('conteudo-detalhes');
    
    docPai.getElementById('sidebar-container').classList.remove('closed');
    docPai.querySelector('[data-target="panel-obras"]').click();

    const descartar = ["Evidência (link)", "Data da atualizaçao", "Responsável pelo preenchimento da informação", "Fonte das informações", "Observações / Riscos / Pendências", "Latitude", "Longitude"];

    let html = `<h3>${p.Ação}</h3>`;
    
    // Tratamento seguro da porcentagem
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
// 5. FILTROS DINÂMICOS
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
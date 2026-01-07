// =========================================
// 1. CONFIGURAÇÕES E URL
// =========================================
const URL_PLANILHA = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSezDjypmlJ_3_JwIwGYlfJSvTwbl9bxVAWe-iq-ORDPOCmQ2giOJAz9NrKP8DZWmTBUzcaCLsGpyS_/pub?gid=1701973260&single=true&output=csv";

// Limites geográficos (Bounds) do seu outro projeto
var initialBounds = [[-18, -60], [10, -30]];
if (window.innerWidth <= 600) {
    initialBounds = [[-16, -62], [4, -23]];
}

// Configuração das Camadas de Base (Mapa e Satélite)
const camadasBase = {
    "mapa": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        maxZoom: 21,         // Zoom máximo permitido no mapa
        maxNativeZoom: 19,   // Zoom real do servidor (impede a tela cinza ao dar zoom digital)
        attribution: '© OpenStreetMap | Dev: Lucas Mendes' 
    }),
    "satelite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 21,         // Zoom máximo permitido no mapa
        maxNativeZoom: 17,   // Esri geralmente tem tiles até o nível 18. Acima disso, ele amplia os pixels.
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community | Dev: Lucas Mendes'
    })
};

const map = L.map('map', {
    zoomControl: false,
    maxZoom: 21,
    minZoom: 6,
    maxBounds: initialBounds,      // Limita a área de navegação
    maxBoundsViscosity: 1.0,        // Faz a borda ser "sólida"
    layers: [camadasBase.mapa] 
}).fitBounds([[-12.5, -45.5], [-2.5, -40.5]]);

// Função global para trocar o mapa (chamada pelo index.html)
window.trocarCamadaBase = function(tipo) {
    if (tipo === 'satelite') {
        map.removeLayer(camadasBase.mapa);
        camadasBase.satelite.addTo(map);
    } else {
        map.removeLayer(camadasBase.satelite);
        camadasBase.mapa.addTo(map);
    }
};

window.dadosCompletos = []; 
// Inicializa o Grupo de Clusters
// Aumentar o raio deixa o mapa mais limpo, agrupando mais pontos
window.clusterPontos = L.markerClusterGroup({ 
    maxClusterRadius: 10, // Aumente este valor (padrão é 80, tente 100 ou 120 para agrupar muito)
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true, // Quando você clica no nível máximo, ele abre os pontos em "teia"
    disableClusteringAtZoom: 16 // Opcional: para de agrupar quando o zoom está muito perto
});
map.addLayer(window.clusterPontos);

// =========================================
// 2. CARREGAMENTO DOS DADOS
// =========================================

Promise.all([
    fetch('data/municipios.geojson').then(res => res.json()),
    fetch(URL_PLANILHA).then(res => res.text())
]).then(([municipiosData, csvText]) => {
    
    window.dadosGlobais = { municipios: municipiosData };
    L.geoJSON(municipiosData, {
        style: { color: '#ccc', weight: 1, fillOpacity: 0.05, interactive: false }
    }).addTo(map);

    const regexCSV = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/; 
    const linhas = csvText.split(/\r?\n/);
    const cabecalho = linhas[0].split(regexCSV).map(c => c.trim().replace(/"/g, ''));

    window.dadosCompletos = linhas.slice(1).map(linha => {
        const colunas = linha.split(regexCSV);
        let obj = {};
        cabecalho.forEach((col, i) => {
            obj[col] = colunas[i] ? colunas[i].trim().replace(/^"|"$/g, '') : "";
        });
        return obj;
    }).filter(item => item.LATITUDE && item.LONGITUDE);

    renderizarPontos(window.dadosCompletos);
    inicializarFiltrosDinamicos();

}).catch(err => console.error("Erro ao carregar dados:", err));

// =========================================
// 3. RENDERIZAÇÃO E ÍCONES (COM CLUSTERS)
// =========================================

function renderizarPontos(lista) {
    // Limpa os clusters antes de renderizar novos
    window.clusterPontos.clearLayers();
    window.todasObras = {}; 

    lista.forEach(item => {
        const lat = parseFloat(item.LATITUDE.replace(',', '.'));
        const lng = parseFloat(item.LONGITUDE.replace(',', '.'));
        const id = item.ID_REGISTRO;
        const status = item.STATUS_ATUAL;

        if (!isNaN(lat) && !isNaN(lng)) {
            window.todasObras[id] = item;

            let urlIcone = 'icones/icones_legendas/padrao.png';
            if (status === 'Contratado') urlIcone = 'icones/icones_legendas/contratado.png';
            else if (status === 'Em Execução') urlIcone = 'icones/icones_legendas/em_execucao.png';
            else if (status === 'Concluído') urlIcone = 'icones/icones_legendas/concluido.png';

            // Proporção sugerida para pins: Largura é aproximadamente 75% da altura
const largura = 25; 
const altura = 35;

const customIcon = L.icon({
    iconUrl: urlIcone,
    iconSize: [largura, altura], // Define um tamanho fixo mas proporcional
    iconAnchor: [largura / 2, altura], // Ancoragem exatamente no centro da base
    popupAnchor: [0, -altura] // Popup aparece exatamente acima do topo do ícone
});

            const marker = L.marker([lat, lng], { icon: customIcon });

            let htmlPopup = `
                <div style="min-width:200px">
                    <h4 style="color:#0352AA; margin-bottom:5px;">${item.PRODUTO}</h4>
                    <p style="font-size:12px"><b>Município:</b> ${item.MUNICIPIO}</p>
                    <p style="font-size:12px"><b>Status:</b> ${item.STATUS_ATUAL}</p>
                    <button class="btn-ver-mais" onclick="window.abrirDetalhesSidebar('${id}')">Ver Detalhes</button>
                </div>`;
            
            marker.bindPopup(htmlPopup);
            
            // IMPORTANTE: Adiciona ao cluster, não ao mapa diretamente
            window.clusterPontos.addLayer(marker);
        }
    });
}

// =========================================
// 4. SIDEBAR (ABRIR DETALHES)
// =========================================

window.abrirDetalhesSidebar = function(id) {
    const p = window.todasObras[id];
    const docPai = window.parent.document;
    const divConteudo = docPai.getElementById('conteudo-detalhes');
    
    docPai.getElementById('sidebar-container').classList.remove('closed');
    docPai.querySelector('[data-target="panel-obras"]').click();

    const perc = parseFloat(p.PERC_EXECUCAO?.replace(',', '.') || 0);
    
    let html = `
        <div class="detalhe-item">
            <strong>Execução Física</strong>
            <div class="progress-container">
                <div class="progress-bar" style="width: ${perc}%"></div>
            </div>
            <span style="font-size:11px">${p.PERC_EXECUCAO} concluído</span>
        </div>
        <div class="detalhe-item"><strong>ID</strong><span>${p.ID_REGISTRO}</span></div>
        <div class="detalhe-item"><strong>Produto</strong><span>${p.PRODUTO}</span></div>
        <div class="detalhe-item"><strong>Tipo de Produto</strong><span>${p.TIPO_PRODUTO}</span></div>
        <div class="detalhe-item"><strong>Município</strong><span>${p.MUNICIPIO}</span></div>
        <div class="detalhe-item"><strong>Território</strong><span>${p.TERRITORIO}</span></div>
        <div class="detalhe-item"><strong>Região Intermediária</strong><span>${p.REGIAO_INTERMEDIARIA}</span></div>
        <div class="detalhe-item"><strong>Região Imediata</strong><span>${p.REGIAO_IMEDIATA}</span></div>
        <div class="detalhe-item"><strong>Órgão Executor</strong><span>${p.ORGAO_EXECUTOR}</span></div>
        <div class="detalhe-item"><strong>Valor Contratado</strong><span>${p.VALOR_CONTRATADO}</span></div>
        <div class="detalhe-item"><strong>Status</strong><span>${p.STATUS_ATUAL}</span></div>
        <div class="detalhe-item"><strong>Tipo Localização</strong><span>${p.TIPO_LOCALIZACAO}</span></div>
        <div class="detalhe-item"><strong>Observações</strong><span>${p.OBSERVACOES || '-'}</span></div>
    `;

    divConteudo.innerHTML = html;
};

// =========================================
// 5. FILTROS DINÂMICOS (ATUALIZADO)
// =========================================

function inicializarFiltrosDinamicos() {
    const getUnique = (col) => [...new Set(window.dadosCompletos.map(d => d[col]))].filter(x => x).sort();

    preencherSelect('filtro-municipio', getUnique('MUNICIPIO'));
    preencherSelect('filtro-territorio', getUnique('TERRITORIO'));
    preencherSelect('filtro-orgao', getUnique('ORGAO_EXECUTOR'));
    preencherSelect('filtro-status', getUnique('STATUS_ATUAL'));
    preencherSelect('filtro-intermediaria', getUnique('REGIAO_INTERMEDIARIA'));
    preencherSelect('filtro-imediata', getUnique('REGIAO_IMEDIATA'));
    preencherSelect('filtro-produto', getUnique('PRODUTO'));
    preencherSelect('filtro-tipo-produto', getUnique('TIPO_PRODUTO'));
    preencherSelect('filtro-tipo-localizacao', getUnique('TIPO_LOCALIZACAO'));

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
    const getS = (id) => Array.from(docPai.getElementById(id).selectedOptions).map(o => o.value);

    // Mapeamento: Filtro HTML -> Coluna na Planilha
    const filtrosAtivos = {
        MUNICIPIO: getS('filtro-municipio'),
        TERRITORIO: getS('filtro-territorio'),
        ORGAO_EXECUTOR: getS('filtro-orgao'),
        STATUS_ATUAL: getS('filtro-status'),
        REGIAO_INTERMEDIARIA: getS('filtro-intermediaria'),
        REGIAO_IMEDIATA: getS('filtro-imediata'),
        PRODUTO: getS('filtro-produto'),
        TIPO_PRODUTO: getS('filtro-tipo-produto'),
        TIPO_LOCALIZACAO: getS('filtro-tipo-localizacao')
    };

    const filtrados = window.dadosCompletos.filter(item => {
        // Verifica se o item passa em TODOS os filtros selecionados
        return Object.keys(filtrosAtivos).every(chave => {
            const selecao = filtrosAtivos[chave];
            return selecao.length === 0 || selecao.includes(item[chave]);
        });
    });

    renderizarPontos(filtrados);
    if(window.innerWidth <= 600) docPai.getElementById('sidebar-container').classList.add('closed');
};

function limparTexto(t) {
    if (!t) return 'padrao';
    return t.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_").replace(/[^\w]/g, '');
}
import os

def converter_geojson_para_js(caminho_entrada, caminho_saida, nome_variavel):
    try:
        # Lê o conteúdo original do GeoJSON
        with open(caminho_entrada, 'r', encoding='utf-8') as f:
            conteudo = f.read()
        
        # Salva como um arquivo JavaScript definindo a variável
        with open(caminho_saida, 'w', encoding='utf-8') as f:
            f.write(f"const {nome_variavel} = {conteudo};\n")
        
        print(f"✅ Sucesso: '{os.path.basename(caminho_saida)}' gerado com a variável '{nome_variavel}'.")
    except FileNotFoundError:
        print(f"❌ Erro: O arquivo '{caminho_entrada}' não foi encontrado.")
    except Exception as e:
        print(f"❌ Erro inesperado ao processar '{caminho_entrada}': {e}")

# Caminho base do seu projeto (conforme os logs que você enviou)
caminho_base = r"G:\Meu Drive\1. COORD. DE ESTUDOS E DADOS\Política Desenv. Rural\mapa_web"

# 1. Converter municípios
converter_geojson_para_js(
    os.path.join(caminho_base, 'data', 'municipios.geojson'),
    os.path.join(caminho_base, 'js', 'municipiosData.js'),
    'municipiosData'
)

# 2. Converter territórios
converter_geojson_para_js(
    os.path.join(caminho_base, 'data', 'municipio_territorio.geojson'),
    os.path.join(caminho_base, 'js', 'territoriosData.js'),
    'territoriosData'
)
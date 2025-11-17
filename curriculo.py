import requests
import os
import io
from PyPDF2 import PdfReader
from google import genai
from google.genai.errors import APIError

# --- CONFIGURAÇÃO ---
# 1. Defina sua chave de API do Gemini.
# É altamente recomendado usar variáveis de ambiente.
# Se estiver usando uma variável de ambiente, o SDK a detectará automaticamente.
# Se não, substitua a string abaixo:
API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyCK_GWv0ZbCh05yCfq6zr1q2s1AYhQ21LQ")

# 2. URL do arquivo PDF a ser processado (a URL que você forneceu)
URL_DO_PDF = "https://drive.google.com/uc?export=download&id=1sIk2Ofsv-lmtKYzs9ZOCDPBPUbjhU85E"
# --------------------


def extrair_texto_pdf_url(url_do_pdf: str) -> str:
    """Baixa o PDF de uma URL e extrai todo o texto."""
    print(f"1/3: Tentando baixar e extrair texto de: {url_do_pdf}")
    
    # 1. Baixar o arquivo
    try:
        response = requests.get(url_do_pdf, timeout=30)
        # Lança exceção para status codes 4xx/5xx
        response.raise_for_status() 
    except requests.exceptions.RequestException as e:
        return f"Erro ao baixar o arquivo: {e}"

    # 2. Extrair o texto
    try:
        # Usa io.BytesIO para tratar o conteúdo binário na memória
        pdf_file = io.BytesIO(response.content)
        leitor = PdfReader(pdf_file)
        texto_extraido = ""
        
        # Itera sobre todas as páginas e extrai o texto
        for page in leitor.pages:
            texto_extraido += page.extract_text() or ""
        
        return texto_extraido
    except Exception as e:
        return f"Erro ao processar o PDF: {e}"

def formatar_curriculo_com_ai(texto_bruto: str, api_key: str) -> str:
    """Usa o modelo Gemini para formatar o texto bruto em um CV profissional em Markdown."""
    print("2/3: Texto extraído com sucesso. Iniciando formatação com Gemini...")
    
    if not api_key or "SUA_CHAVE_API_DO_GEMINI_AQUI" in api_key:
        return "\n❌ ERRO: A chave de API do Gemini não foi configurada. Não é possível formatar."

    try:
        client = genai.Client(api_key=api_key)
        
        # Prompt detalhado para garantir a formatação correta
        prompt = (
            "O texto a seguir é um currículo extraído em formato bruto de um PDF. "
            "Sua tarefa é REFORMATAR este texto no idioma Português do Brasil. "
            "Use Markdown para criar um layout profissional, limpo e bem estruturado. "
            "Use títulos (##), listas (*) e tabelas para Habilidades. NÃO adicione "
            "informações que não estejam no texto. Garanta que todas as seções, "
            "como Nome, Contato, Formação, Experiências e Habilidades, sejam destacadas."
            f"\n\nTEXTO BRUTO:\n\n---\n{texto_bruto}\n---"
        )
        
        response = client.models.generate_content(
            model="gemini-2.5-flash", # Modelo rápido e eficiente para tarefas de formatação
            contents=prompt
        )
        
        return response.text
    
    except APIError as e:
        return f"\n❌ ERRO da API do Gemini: Verifique se sua chave de API está correta e ativa. Detalhes: {e}"
    except Exception as e:
        return f"\n❌ ERRO inesperado na formatação com IA: {e}"


# --- EXECUÇÃO PRINCIPAL ---
if __name__ == "__main__":
    
    # Etapa 1: Extrair o texto
    texto_bruto = extrair_texto_pdf_url(URL_DO_PDF)

    if "Erro" in texto_bruto:
        print("\n❌ Processo falhou na extração:")
        print(texto_bruto)
    else:
        # Etapa 2: Formatar o currículo com IA
        curriculo_formatado = formatar_curriculo_com_ai(texto_bruto, API_KEY)
        
        # Etapa 3: Imprimir o resultado
        print("\n3/3: Impressão do resultado...")
        print("="*60)
        print("✅ CURRÍCULO FORMATADO COM SUCESSO:")
        print("="*60)
        print(curriculo_formatado)
        print("="*60)
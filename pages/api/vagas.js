// pages/api/vagas.js

import axios from 'axios';

// URL da API Externa
const EXTERNAL_API_URL = 'https://api.quickin.io/accounts/68deda72a6a0400013424012/jobs';

// TOKEN DE AUTORIZAÇÃO OBRIGATÓRIO PARA A API EXTERNA
const AUTH_TOKEN = 'LqPTd7UuO97Su5W8WGG1NyKhvq5Jj'; 

// WEBHOOK PARA BANCO DE TALENTOS (MAKE.COM/INTEGROMAT)
const WEBHOOK_URL = 'https://hook.us1.make.com/oeyvgsw8qrcfd6o1lcwh1q7s8y6j7q2l';

/**
 * Envia os dados do candidato para o webhook de banco de talentos.
 * Não interrompe o fluxo principal da API em caso de falha.
 * @param {object} data - Dados do candidato a serem enviados.
 */
async function sendToTalentBank(data) {
    const payload = {
        nome: data.nome,
        cep: data.cep,
        cidade: data.cidade,
        linkCurriculo: data.linkCurriculo,
        areaInteresse: data.tag,
        telefone: data.telefone
    };

    try {
        // Envia a requisição POST para o webhook
        await axios.post(WEBHOOK_URL, payload);
        console.log('Dados do candidato enviados com sucesso para o Banco de Talentos.');
    } catch (webhookError) {
        // Loga o erro, mas continua o fluxo, pois a resposta ao usuário é prioridade.
        console.error('Falha ao enviar dados para o webhook (Banco de Talentos):', webhookError.message);
    }
}


export default async function handler(req, res) {
  // Apenas aceita requisições POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  // 1. Recebe dados do candidato do body (todos os campos, incluindo os não usados no filtro)
  const { 
    tag: areaInteresse, 
    cidade: cidadeCandidato,
    nome,
    cep,
    linkCurriculo,
    telefone
  } = req.body;

  // Verifica se os campos essenciais para o filtro foram fornecidos
  if (!areaInteresse || !cidadeCandidato) {
    return res.status(400).json({ 
      error: 'Corpo da requisição inválido.',
      required: { tag: 'Área de interesse', cidade: 'Cidade do candidato' }
    });
  }

  try {
    // Configuração do header com o token Bearer
    const config = {
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`
        }
    };
    
    // 2. Busca as vagas na API externa (agora com o header de autorização)
    const responseAPI = await axios.get(EXTERNAL_API_URL, config);
    const vagas = responseAPI.data.docs || [];

    // Normaliza os termos para o filtro
    const areaInteresseNormalized = areaInteresse.toLowerCase().trim();
    const cidadeCandidatoNormalized = cidadeCandidato.toLowerCase().trim();

    // 3. Filtra as vagas
    const vagasFiltradas = vagas.filter(vaga => {
      // 3.1 Filtro por Cidade
      const cidadeVagaNormalized = vaga.city ? vaga.city.toLowerCase().trim() : '';
      const cidadeMatch = cidadeVagaNormalized === cidadeCandidatoNormalized;

      // 3.2 Filtro por Área de Interesse (Tag no Título)
      const tituloVagaNormalized = vaga.title ? vaga.title.toLowerCase().trim() : '';
      const areaMatch = tituloVagaNormalized.includes(areaInteresseNormalized);
      
      // Retorna apenas vagas que correspondem a AMBOS os filtros (Cidade E Área de Interesse)
      // E estão "published" (se aplicável, mas a API externa já deve cuidar disso)
      return cidadeMatch && areaMatch && vaga.publicate === 'published';
    });

    // 4. Formata e retorna o resultado
    if (vagasFiltradas.length > 0) {
      // Se houver vagas, retorna as vagas encontradas
      const vagasFormatadas = vagasFiltradas.map(vaga => ({
        nomeVaga: vaga.title || 'Não informado',
        beneficios: vaga.benefits ? vaga.benefits.replace(/<\/?p>/g, '').replace(/&nbsp;/g, ' ').trim() : 'Não informado',
        salario: vaga.remuneration && vaga.currency 
                 ? `${vaga.currency} ${vaga.remuneration.toFixed(2)} / ${vaga.remuneration_period || 'período'}` 
                 : 'A combinar',
        horario: vaga.description ? extrairHorario(vaga.description) : 'Não informado',
        cidade: `${vaga.city || 'Não informada'} - ${vaga.region || '??'}`,
        // 'responsavel' não está na API original, mas será simulado para o retorno:
        responsavel: 'AMX Consultoria de RH (via Quickin.io)'
      }));

      return res.status(200).json({
        response: vagasFiltradas.length === 1 
          ? `Encontramos 1 vaga disponível para a cidade de ${cidadeCandidato}.`
          : `Encontramos ${vagasFiltradas.length} vagas disponíveis para a cidade de ${cidadeCandidato}.`,
        vagas: vagasFormatadas
      });
    } else {
      // Caso nenhuma vaga seja encontrada, salva no banco de talentos e retorna a mensagem
      
      // Chama a função para enviar os dados para o webhook (Banco de Talentos)
      await sendToTalentBank(req.body); 

      return res.status(200).json({
        response: 'Infelizmente não há vagas disponíveis! Mas seu currículo será salvo em nosso banco de talentos e entraremos em contato quando surgir uma oportunidade'
      });
    }

  } catch (error) {
    // Adiciona log de erro mais detalhado se a falha for na autorização ou na API externa
    if (error.response && error.response.status === 401) {
        console.error('Erro de Autorização (401): Verifique o token ou se ele expirou.', error.message);
        return res.status(401).json({ 
            error: 'Falha de autenticação ao acessar a API externa. Verifique o token Bearer.',
            details: error.response.data 
        });
    }

    console.error('Erro ao buscar vagas na API externa:', error.message);
    return res.status(500).json({ 
      error: 'Erro interno do servidor ao processar a requisição de vagas.',
      details: error.message 
    });
  }
}

// Função auxiliar para tentar extrair a Escala/Horário da descrição
function extrairHorario(description) {
    const match = description.match(/Escala:\s*([^<\n]+)/i);
    if (match && match[1]) {
        // Remove tags HTML e espaços desnecessários
        return match[1].replace(/<\/?p>/g, '').replace(/&nbsp;/g, ' ').trim();
    }
    // Tenta outra forma de extração para o 'Agente de Portaria'
    const altMatch = description.match(/Escala\/Hor&aacute;rio:\s*([^<\n]+)/i);
    if (altMatch && altMatch[1]) {
        return altMatch[1].replace(/<\/?p>/g, '').replace(/&nbsp;/g, ' ').trim();
    }
    return 'Não especificado na descrição';
}
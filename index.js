require('dotenv').config();
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const Groq = require('groq-sdk');
const { ChatGoogleGenerativeAI, HumanMessage } = require('@langchain/google-genai');

// Inicializa o cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth()
});

// Inicializa o cliente do Groq com a chave de API
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Configura o modelo do Google GenAI para análise de imagem
const visionModel = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    maxOutputTokens: 2048,
});

// Armazena o histórico das mensagens para manter o contexto
const messageHistory = [
    {
        role: "system",
        content: "Você é um assistente útil e amigável no WhatsApp, seu nome é Saíde Omar Saíde. Foi projetado para responder perguntas e fornecer informações com base no modelo Groq. Responda apenas às mensagens enviadas por usuários e ignore qualquer mensagem que você mesmo tenha enviado para evitar loops infinitos. Seja claro, objetivo e mantenha um tom profissional e amigável."
    }
];

// Função para verificar e limitar o histórico de mensagens
function limitarHistoricoMensagens(maxMensagens = 7) {
    // Mantém apenas as últimas `maxMensagens` mensagens no histórico
    if (messageHistory.length > maxMensagens) {
        messageHistory.splice(0, messageHistory.length - maxMensagens);
    }
}

// Função para gerar uma resposta de IA usando o modelo Groq
async function gerarRespostaIA(mensagemUsuario) {
    try {
        // Adiciona a mensagem do usuário ao histórico de mensagens
        messageHistory.push({
            role: "user",
            content: mensagemUsuario,
        });

        // Limita o histórico para evitar excesso de tokens
        limitarHistoricoMensagens();

        // Faz a chamada para o Groq API com o histórico atualizado
        const chatCompletion = await groq.chat.completions.create({
            messages: messageHistory,
            model: "llama-3.2-90b-vision-preview",
            temperature: 1,
            max_tokens: 1024,
            top_p: 1,
            stream: false,
            stop: null
        });

        // Extrai a resposta do bot e adiciona ao histórico
        const respostaIA = chatCompletion.choices[0]?.message?.content || "Não consegui gerar uma resposta.";
        messageHistory.push({
            role: "assistant",
            content: respostaIA,
        });

        return respostaIA;
    } catch (error) {
        console.error("Erro ao gerar resposta da IA:", error);
        return "Desculpe, houve um erro ao processar sua mensagem.";
    }
}

// Função para processar imagem e gerar uma resposta baseada no conteúdo da imagem
async function gerarRespostaImagem(message) {
    try {
        const media = await message.downloadMedia();
        // Adiciona o prefixo MIME para o formato base64 necessário
        const image = `data:${media.mimetype};base64,${media.data}`;

        // Cria o conteúdo de entrada para o modelo de visão do Google
        const input2 = [
            {
                role: "human",
                content: [
                    {
                        type: "text",
                        text: "Analise a imagem fornecida e descreva-a com o máximo de detalhes possível. Caso existam letras ou textos na imagem, transcreva-os integralmente. Garanta que todas as informações visuais relevantes sejam mencionadas, incluindo cores, formas, objetos, contextos e quaisquer outros elementos presentes. Se for codigo depois da descrição, escreva o codigo da respetiva linguaguem presente na imagem, se for problema matematico, depois da descrição resolva o problema e apresente a resposta."
                    },
                    {
                        type: "image_url",
                        image_url: image
                    }
                ],
            },
        ];

        // Invoca o modelo de visão para processar a imagem
        const res = await visionModel.invoke(input2);

        // Verifica se a resposta contém conteúdo válido
        let respostaIA;
        if (res && res.content) {
            respostaIA = res.content;

            // Adiciona a interação ao histórico de mensagens
            messageHistory.push(
                {
                    role: "user",
                    content: "[Imagem recebida do usuário: imagem.png]"
                },
                {
                    role: "assistant",
                    content: respostaIA
                }
            );
        } else {
            respostaIA = "Não consegui analisar a imagem. Tente novamente mais tarde.";
            console.error("Resposta da API não contém conteúdo válido:", res);
        }

        return respostaIA;
    } catch (error) {
        console.error("Erro ao processar a imagem:", error);
        return "Desculpe, houve um erro ao analisar a imagem.";
    }
}

// Função para enviar resposta ao usuário, com controle de erros
async function enviarResposta(message, resposta) {
    try {
        await message.reply(resposta);
    } catch (error) {
        console.error("Erro ao enviar a resposta ao usuário:", error);
    }
}

// Evento para indicar que o cliente está pronto
client.on('ready', () => {
    console.log('Cliente está pronto!');
});

// Exibe o QR code no terminal para autenticação no WhatsApp Web
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

// Evento para responder a mensagens, incluindo mensagens com imagem
client.on('message_create', async message => {
    if (message.fromMe) return;

    let resposta;
    if (message.hasMedia) {
        // Mensagem contém mídia (imagem)
        resposta = await gerarRespostaImagem(message);
    } else {
        // Mensagem de texto
        resposta = await gerarRespostaIA(message.body);
    }

    // Envia a resposta ao usuário com controle de erros
    await enviarResposta(message, resposta);
});

// Inicializa o cliente do WhatsApp
client.initialize();

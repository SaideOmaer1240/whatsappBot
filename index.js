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

// Função para gerar uma resposta de IA usando o modelo Groq
async function gerarRespostaIA(mensagemUsuario) {
    try {
        // Adiciona a mensagem do usuário ao histórico de mensagens
        messageHistory.push({
            role: "user",
            content: mensagemUsuario,
        });

        const chatCompletion = await groq.chat.completions.create({
            messages: messageHistory,
            model: "llama-3.2-90b-vision-preview",
            temperature: 1,
            max_tokens: 1024,
            top_p: 1,
            stream: false,
            stop: null
        });

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
        const image = media.data; // Base64 da imagem

        // Cria o conteúdo de entrada para o modelo
        const input2 = [
            {
                role: "human",
                content: [
                    {
                        type: "text",
                        text: "Descreva a imagem a seguir."
                    },
                    {
                        type: "image_url",
                        image_url: `data:${media.mimetype};base64,${image}`
                    }
                ],
            },
        ];

        const res = await visionModel.invoke(input2);

        // Verifica se a resposta contém 'content' e retorna a descrição da imagem
        if (res && res.content) {
            return res.content;
        } else {
            console.error("Resposta da API não contém conteúdo válido:", res);
            return "Não consegui analisar a imagem. Tente novamente mais tarde.";
        }
    } catch (error) {
        console.error("Erro ao processar a imagem:", error);
        return "Desculpe, houve um erro ao analisar a imagem.";
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

    // Envia a resposta ao usuário
    message.reply(resposta);
});

// Inicializa o cliente do WhatsApp
client.initialize();

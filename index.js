require('dotenv').config();

const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const Groq = require('groq-sdk');

// Inicializa o cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth()
});

// Inicializa o cliente do Groq com a chave de API
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

// Evento para indicar que o cliente está pronto
client.on('ready', () => {
    console.log('Cliente está pronto!');
});

// Exibe o QR code no terminal para autenticação no WhatsApp Web
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

// Evento para responder a mensagens, apenas se não for uma mensagem do próprio bot
client.on('message_create', async message => {
    if (message.fromMe) return; // Ignora as mensagens enviadas pelo próprio bot

    // Gera a resposta usando a função de IA e envia ao usuário
    const respostaIA = await gerarRespostaIA(message.body);
    message.reply(respostaIA);
});

// Inicializa o cliente do WhatsApp
client.initialize();

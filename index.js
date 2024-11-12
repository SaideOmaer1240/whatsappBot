require('dotenv').config();
const fs = require('fs'); 
const path = require("path");
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const Groq = require('groq-sdk');
const { ChatGoogleGenerativeAI, HumanMessage } = require('@langchain/google-genai');

// Inicializa o cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth()
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const visionModel = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    maxOutputTokens: 2048,
});

// Cria um objeto para armazenar históricos de mensagens para cada usuário
const userHistories = {};

// Função para baixar a mídia (imagem, áudio, etc.) de uma mensagem
async function baixarMidia(message) {
    try {
        const media = await message.downloadMedia();
        return {
            mimetype: media.mimetype,
            data: `data:${media.mimetype};base64,${media.data}`
        };
    } catch (error) {
        console.error("Erro ao baixar a mídia:", error);
        return null;
    }
}

// Função para verificar e limitar o histórico de mensagens do usuário
function limitarHistoricoMensagens(userId, maxMensagens = 7) {
    if (userHistories[userId].length > maxMensagens) {
        userHistories[userId].splice(0, userHistories[userId].length - maxMensagens);
    }
}

// Função para gerar uma resposta de IA usando o modelo Groq
async function gerarRespostaIA(userId, mensagemUsuario) {
    try {
        // Cria um histórico inicial se o usuário ainda não existir
        if (!userHistories[userId]) {
            userHistories[userId] = [{
                role: "system",
                content: "Você é um assistente útil e amigável no WhatsApp, seu nome é Saíde Omar Saíde."
            }];
        }

        // Adiciona a mensagem do usuário ao histórico
        userHistories[userId].push({
            role: "user",
            content: mensagemUsuario,
        });

        // Limita o histórico do usuário para evitar excesso de tokens
        limitarHistoricoMensagens(userId);

        const chatCompletion = await groq.chat.completions.create({
            messages: userHistories[userId],
            model: "llama-3.2-90b-vision-preview",
            temperature: 1,
            max_tokens: 1024,
        });

        const respostaIA = chatCompletion.choices[0]?.message?.content || "Não consegui gerar uma resposta.";
        
        userHistories[userId].push({
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
async function gerarRespostaImagem(userId, mediaData){
    try {
        const input = [{
            role: "human",
            content: [
                { type: "text", text: "Analise a imagem fornecida e descreva-a detalhadamente." },
                { type: "image_url", image_url: mediaData.data }
            ],
        }];

        const res = await visionModel.invoke(input);
        let respostaIA = res && res.content ? res.content : "Não consegui analisar a imagem.";

        if (!userHistories[userId]) {
            userHistories[userId] = [{
                role: "system",
                content: "Você é um assistente útil e amigável no WhatsApp, seu nome é Saíde Omar Saíde."
            }];
        }

        userHistories[userId].push(
            { role: "user", content: "[Imagem recebida do usuário: imagem.png]" },
            { role: "assistant", content: respostaIA }
        );

        return respostaIA;
    } catch (error) {
        console.error("Erro ao processar a imagem:", error);
        return "Desculpe, houve um erro ao analisar a imagem.";
    }
}

// Função para transcrever áudio
async function transcreverAudio(userId, mediaData) {
    try { 
        const tempFilePath = path.join(__dirname, `audio_${Date.now()}.mp3`);

        // Decodifica e salva o áudio no caminho temporário
        const base64Data = mediaData.data.split(",")[1];
        fs.writeFileSync(tempFilePath, base64Data, { encoding: "base64" });

        // Realiza a transcrição usando o Groq
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-large-v3-turbo",
        });

        // Exclui o arquivo temporário após a transcrição
        fs.unlinkSync(tempFilePath);

         
        const transcricao = transcription.text || "Não consegui transcrever o áudio.";

        resposta = await gerarRespostaIA(userId, transcricao) || "Não consegui transcrever o áudio.";
 
        return resposta;
    } catch (error) {
        console.error("Erro ao transcrever o áudio:", error);
        return "Desculpe, houve um erro ao processar o áudio.";
    }
}


// Função para enviar resposta ao usuário com controle de erros
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

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

// Evento para responder a mensagens, incluindo mensagens com imagem e áudio
client.on('message_create', async message => {
    if (message.fromMe) return;

    const userId = message.from; // Usa o número de telefone do WhatsApp como ID único do usuário
    console.log(userId);
    let resposta;

    if (message.hasMedia) {
        const mediaData = await baixarMidia(message);

        if (mediaData) {
            if (mediaData.mimetype.startsWith('image')) {
                resposta = await gerarRespostaImagem(userId, mediaData);
            } else if (mediaData.mimetype.startsWith('audio')) {
                resposta = await transcreverAudio(userId, mediaData);
            } else {
                resposta = "Tipo de mídia não suportado.";
            }
        } else {
            resposta = "Não consegui baixar a mídia.";
        }
    } else {
        resposta = await gerarRespostaIA(userId, message.body);
    }

    await enviarResposta(message, resposta);
});

// Inicializa o cliente do WhatsApp
client.initialize();

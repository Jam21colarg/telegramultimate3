require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./db');
const OpenAI = require('openai');

const TIMEZONE = process.env.TIMEZONE || 'America/Argentina/Buenos_Aires';
const PORT = process.env.PORT || 8080;
const PUBLIC_URL = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;
const DOMAIN = PUBLIC_URL ? `https://${PUBLIC_URL}` : process.env.DOMAIN;

const app = express();
app.use(express.json());

// 1. INICIO RÁPIDO PARA RAILWAY
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor activo en puerto ${PORT}`);
});

app.get('/', (req, res) => res.status(200).send('Ultimate Bot Online ✅'));

// 2. CONFIGURACIÓN IA
const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY, 
    baseURL: "https://api.groq.com/openai/v1" 
});

const bot = new Telegraf(process.env.BOT_TOKEN);

/**
 * Función que procesa el mensaje con IA para decidir si es recordatorio o charla
 */
async function processMessageWithAI(message) {
    const now = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss dddd');
    try {
        const response = await openai.chat.completions.create({
            model: 'llama-3.3-70b-versatile', 
            messages: [
                { 
                    role: 'system', 
                    content: `Eres un asistente personal inteligente, cálido y eficiente. Hoy es ${now}. 
                    Analiza el mensaje del usuario:
                    1. Si es un recordatorio: Extrae la fecha y responde con este JSON:
                       {"es_recordatorio": true, "date": "YYYY-MM-DD HH:mm", "texto": "...", "respuesta": "Una confirmación amigable y breve"}
                    2. Si NO es un recordatorio (saludo, duda, charla): Responde con este JSON:
                       {"es_recordatorio": false, "respuesta": "Tu respuesta humana y natural aquí"}` 
                },
                { role: 'user', content: message }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" }
        });

        return JSON.parse(response.choices[0].message.content);
    } catch (err) {
        console.error('❌ Error IA:', err.message);
        return null;
    }
}

// 3. MANEJADORES DE TELEGRAM
bot.start(ctx => ctx.reply('¡Hola! 👋 Soy tu asistente. Podes decirme cosas como "Recordame el gimnasio hoy a las 19" o simplemente charlar conmigo. ¿En qué te ayudo?'));

bot.on('text', async ctx => {
    if (ctx.message.text.startsWith('/')) return;

    // Simula que el bot está procesando
    await ctx.sendChatAction('typing');
    
    try {
        const res = await processMessageWithAI(ctx.message.text);
        
        if (!res) return ctx.reply('Perdón, me distraje un segundo. ¿Qué me decías?');

        if (res.es_recordatorio && res.date) {
            // Guardar en DB de forma silenciosa
            await db.createReminder(ctx.from.id, res.texto, res.date);
            // Responder con la frase cálida de la IA
            await ctx.reply(res.respuesta);
        } else {
            // Es solo charla, respondemos lo que la IA sugirió
            await ctx.reply(res.respuesta);
        }

    } catch (err) {
        console.error('❌ Error general:', err);
        ctx.reply('Hubo un pequeño error técnico, pero ya estoy listo de nuevo. ¿Qué necesitabas?');
    }
});

// 4. CRON (Envío de notificaciones)
cron.schedule('* * * * *', async () => {
    const now = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm');
    try {
        const due = await db.getDueReminders(now);
        for (const r of due) {
            // Notificación con formato limpio
            await bot.telegram.sendMessage(r.user_id, `🔔 **¡Hola! Te recuerdo esto:**\n\n> ${r.texto}`);
            await db.markAsSent(r.id);
        }
    } catch (e) { 
        console.error('Error Cron:', e); 
    }
});

// 5. WEBHOOK / DEPLOY
if (DOMAIN) {
    const secretPath = `/telegraf/${bot.secretPathComponent()}`;
    app.use(bot.webhookCallback(secretPath));
    bot.telegram.setWebhook(`${DOMAIN}${secretPath}`)
        .then(() => console.log(`🤖 Webhook listo`))
        .catch(err => console.error('❌ Error Webhook:', err));
} else {
    bot.launch();
    console.log('🤖 Bot en modo Polling');
}

// 6. CIERRE LIMPIO
process.once('SIGINT', () => { bot.stop('SIGINT'); server.close(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); server.close(); });

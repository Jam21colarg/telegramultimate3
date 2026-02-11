require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./db');
const OpenAI = require('openai');

const TIMEZONE = process.env.TIMEZONE || 'America/Argentina/Buenos_Aires';
const PORT = process.env.PORT || 8080;
const DOMAIN = process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : process.env.DOMAIN;

const app = express();
app.use(express.json());

// 1. ARRANCAR EXPRESS DE INMEDIATO (Vital para el Health Check de Railway)
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor escuchando en puerto ${PORT}`);
});

app.get('/', (req, res) => res.status(200).send('Bot Online ✅'));

// 2. CONFIGURAR IA Y BOT
const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY, 
    baseURL: "https://api.groq.com/openai/v1" 
});

const bot = new Telegraf(process.env.BOT_TOKEN);

async function parseReminderWithAI(message) {
    const now = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss dddd');
    try {
        const response = await openai.chat.completions.create({
            model: 'llama-3.3-70b-versatile', 
            messages: [
                { role: 'system', content: `Hoy es ${now}. Responde solo JSON: {"date": "YYYY-MM-DD HH:mm", "texto": "...", "tags": "..."}. Si no es un recordatorio o es una frase sin sentido de tiempo, responde: {"error": "si"}` },
                { role: 'user', content: message }
            ],
            temperature: 0,
            response_format: { type: "json_object" } // Esto fuerza a la IA a dar un JSON limpio
        });

        const res = JSON.parse(response.choices[0].message.content);
        return (res.error === "si" || !res.date) ? null : res;
    } catch (err) {
        console.error('❌ Error IA:', err.message);
        return null;
    }
}

// 3. COMANDOS
bot.start(ctx => ctx.reply('🚀 Bot activo. Envíame algo como: "Recordarme comprar pan hoy a las 19:00"'));

bot.on('text', async ctx => {
    if (ctx.message.text.startsWith('/')) return;
    const waiting = await ctx.reply('Procesando... ⏳');
    
    try {
        const res = await parseReminderWithAI(ctx.message.text);
        
        if (!res) {
            return ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, 'No entendí la fecha o el evento. Intenta ser más específico.');
        }

        const id = await db.createReminder(ctx.from.id, res.texto, res.date, res.tags);
        const fechaOk = moment(res.date).format('DD/MM HH:mm');
        
        await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, `✅ Anotado:\n🔔 ${res.texto}\n📅 ${fechaOk}\n🆔 ${id}`);
    } catch (err) {
        console.error('❌ Error en el proceso:', err);
        ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, 'Hubo un problema. Intenta de nuevo.');
    }
});

// 4. CRON (Revisión de recordatorios cada minuto)
cron.schedule('* * * * *', async () => {
    const now = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm');
    try {
        const due = await db.getDueReminders(now);
        for (const r of due) {
            await bot.telegram.sendMessage(r.user_id, `🔔 **RECORDATORIO:**\n${r.texto}`);
            await db.markAsSent(r.id);
        }
    } catch (e) { 
        console.error('Error Cron:', e); 
    }
});

// 5. CONFIGURACIÓN DE MODO (Webhook o Polling)
if (DOMAIN) {
    const secretPath = `/telegraf/${bot.secretPathComponent()}`;
    app.use(bot.webhookCallback(secretPath));
    bot.telegram.setWebhook(`${DOMAIN}${secretPath}`)
        .then(() => console.log(`🤖 Webhook configurado en: ${DOMAIN}`))
        .catch(err => console.error('❌ Error Webhook:', err));
} else {
    bot.launch();
    console.log('🤖 Bot iniciado por Polling (Local)');
}

// 6. MANEJO DE CIERRE LIMPIO (Para evitar el error SIGTERM brusco)
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    server.close();
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    server.close();
});

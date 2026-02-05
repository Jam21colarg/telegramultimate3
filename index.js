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

// 1. ARRANCAR EXPRESS DE INMEDIATO
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
        { role: 'system', content: `Hoy es ${now}. Responde solo JSON: {"date": "YYYY-MM-DD HH:mm", "texto": "...", "tags": "..."}. Si no es recordatorio: {"error": "no"}` },
        { role: 'user', content: message }
      ],
      temperature: 0,
    });
    const res = JSON.parse(response.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);
    return res.error ? null : res;
  } catch (err) {
    console.error('❌ Error IA:', err.message);
    return null;
  }
}

// 3. COMANDOS
bot.start(ctx => ctx.reply('🚀 Bot activo. Envíame un recordatorio.'));

bot.on('text', async ctx => {
  if (ctx.message.text.startsWith('/')) return;
  const waiting = await ctx.reply('Procesando... ⏳');
  
  try {
    const res = await parseReminderWithAI(ctx.message.text);
    if (!res) return ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, 'No entendí la fecha.');

    const id = await db.createReminder(ctx.from.id, res.texto, res.date, res.tags);
    const fechaOk = moment(res.date).format('DD/MM HH:mm');
    
    await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, `✅ Anotado:\n🔔 ${res.texto}\n📅 ${fechaOk}\n🆔 ${id}`);
  } catch (err) {
    console.error('❌ Error en el proceso:', err);
    ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, 'Hubo un problema. Intenta de nuevo.');
  }
});

// 4. CRON
cron.schedule('* * * * *', async () => {
  const now = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm');
  try {
    const due = await db.getDueReminders(now);
    for (const r of due) {
      await bot.telegram.sendMessage(r.user_id, `🔔 **RECORDATORIO:**\n${r.texto}`);
      await db.markAsSent(r.id);
    }
  } catch (e) { console.error('Error Cron:', e); }
});

// 5. WEBHOOK FINAL
if (DOMAIN) {
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;
  bot.telegram.setWebhook(`${DOMAIN}${secretPath}`)
    .then(() => console.log('🤖 Webhook configurado'));
  app.use(bot.webhookCallback(secretPath));
} else {
  bot.launch();
}

// Keep-alive para que el proceso no se cierre nunca
setInterval(() => {}, 1000 * 60 * 60);

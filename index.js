require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./db');
const OpenAI = require('openai');

// 1. CONFIGURACIÓN INICIAL
const TIMEZONE = process.env.TIMEZONE || 'America/Argentina/Buenos_Aires';
const PORT = process.env.PORT || 8080;
let DOMAIN = process.env.RAILWAY_STATIC_URL || process.env.DOMAIN;
if (DOMAIN && !DOMAIN.startsWith('http')) {
    DOMAIN = `https://${DOMAIN}`;
}

// 2. INICIAR EXPRESS PRIMERO (Vital para Railway)
const app = express();
app.use(express.json());

// Esta es la ruta que Railway usará para el Healthcheck
app.get('/', (req, res) => res.status(200).send('OK'));

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor Express listo en puerto ${PORT}`);
});

// 3. INICIAR OPENAI Y BOT DESPUÉS
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= IA PARSER =================
async function parseReminderWithAI(message) {
  const now = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss dddd');
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: `Hoy es ${now}. Extrae recordatorios en JSON.` },
        { role: 'user', content: `Mensaje: "${message}". Formato: {"date": "YYYY-MM-DD HH:mm", "texto": "...", "tags": "..."}` }
      ],
      temperature: 0,
    });
    const content = response.choices[0].message.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (err) {
    console.error('❌ Error OpenAI:', err.message);
    return null;
  }
}

// ================= COMANDOS Y MENSAJES =================
bot.start(ctx => ctx.reply('Bot activo. Envíame un recordatorio.'));

bot.on('text', async ctx => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  const waiting = await ctx.reply('Procesando... ⏳');
  const res = await parseReminderWithAI(text);

  if (!res || !res.date) {
    return ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, '❌ No entendí la fecha.');
  }

  const id = await db.createReminder(ctx.from.id, res.texto, res.date, res.tags);
  ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, `✅ Guardado: ${res.texto} (${res.date})`);
});

// ================= CRON =================
cron.schedule('* * * * *', async () => {
  const due = await db.getDueReminders();
  for (const r of due) {
    bot.telegram.sendMessage(r.user_id, `🔔 RECORDATORIO: ${r.texto}`).catch(console.error);
    db.markAsSent(r.id).catch(console.error);
  }
});

// ================= LANZAMIENTO WEBHOOK =================
if (DOMAIN) {
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;
  bot.telegram.setWebhook(`${DOMAIN}${secretPath}`)
    .then(() => console.log('🤖 Webhook configurado'))
    .catch(err => console.error('❌ Error Webhook:', err));
  app.use(bot.webhookCallback(secretPath));
} else {
  bot.launch().then(() => console.log('🤖 Polling activo'));
}

// NO cerramos el servidor aquí para evitar que Railway piense que falló

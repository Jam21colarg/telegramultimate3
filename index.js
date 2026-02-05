require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./db');
const OpenAI = require('openai');

// ================= CONFIGURACIÓN =================
const TIMEZONE = process.env.TIMEZONE || 'America/Argentina/Buenos_Aires';
const PORT = process.env.PORT || 8080;
let DOMAIN = process.env.RAILWAY_STATIC_URL || process.env.DOMAIN;

// Asegurar que el dominio tenga HTTPS para el Webhook
if (DOMAIN && !DOMAIN.startsWith('http')) {
    DOMAIN = `https://${DOMAIN}`;
}

// ================= SERVIDOR EXPRESS (EL ANCLA) =================
const app = express();
app.use(express.json());

// Ruta de Healthcheck para que Railway no apague el bot
app.get('/', (req, res) => {
    console.log('--- Healthcheck recibido por Railway ✅ ---');
    res.status(200).send('Bot Online');
});

// Forzamos a que escuche en 0.0.0.0 (importante para Railway)
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor Express activo en puerto ${PORT}`);
});

// ================= INICIALIZACIÓN DE APIS =================
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
        { role: 'user', content: `Extrae de: "${message}". Formato JSON: {"date": "YYYY-MM-DD HH:mm", "texto": "...", "tags": "..."}. Si no es recordatorio devuelve {"error": "no"}` }
      ],
      temperature: 0,
    });

    const content = response.choices[0].message.content.trim();
    console.log('🤖 Respuesta IA:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const res = JSON.parse(jsonMatch[0]);
    return res.error ? null : res;
  } catch (err) {
    console.error('❌ Error OpenAI:', err.message);
    return null;
  }
}

// ================= COMANDOS DEL BOT =================
bot.start(ctx => ctx.reply('🚀 Bot de Recordatorios Activo.\nEnvíame algo como: "Mañana a las 10am llamar al dentista"'));

bot.command('list', async ctx => {
    const reminders = await db.getReminders(ctx.from.id);
    if (!reminders.length) return ctx.reply('📭 No hay pendientes.');
    let msg = '⏰ **Recordatorios:**\n\n';
    reminders.forEach(r => {
        msg += `🆔 ${r.id} | ${r.texto}\n📅 ${moment(r.fecha).tz(TIMEZONE).format('DD/MM HH:mm')}\n\n`;
    });
    ctx.reply(msg);
});

// ================= PROCESAR TEXTO =================
bot.on('text', async ctx => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  const waiting = await ctx.reply('Pensando... ⏳');
  
  const res = await parseReminderWithAI(text);

  if (!res || !res.date) {
    return ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, '❌ No entendí la fecha. Prueba: "Mañana a las 10am..."');
  }

  try {
    const id = await db.createReminder(ctx.from.id, res.texto, res.date, res.tags);
    const fechaOk = moment(res.date).format('DD/MM [a las] HH:mm');
    ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, `✅ Anotado:\n🔔 ${res.texto}\n📅 ${fechaOk}\n🆔 ${id}`);
  } catch (dbErr) {
    ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, '❌ Error al guardar en base de datos.');
  }
});

// ================= CRON (REVISIÓN CADA MINUTO) =================
cron.schedule('* * * * *', async () => {
  try {
    const due = await db.getDueReminders();
    for (const r of due) {
      await bot.telegram.sendMessage(r.user_id, `🔔 **RECORDATORIO:**\n${r.texto}`);
      await db.markAsSent(r.id);
    }
  } catch (e) {
    console.error('Error en Cron:', e.message);
  }
});

// ================= LANZAMIENTO INTEGRADO =================


if (DOMAIN) {
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;
  
  // Configurar Webhook en Telegram
  bot.telegram.setWebhook(`${DOMAIN}${secretPath}`)
    .then(() => console.log('🤖 Webhook configurado exitosamente'));

  // Middleware para que Express reciba los mensajes del Webhook
  app.use(bot.webhookCallback(secretPath));
  
} else {
  // Local Development
  bot.launch().then(() => console.log('🤖 Bot iniciado con Polling (Local)'));
}

// NOTA: No cerramos el servidor con SIGTERM/SIGINT aquí para que Railway
// mantenga el proceso persistente y estable.

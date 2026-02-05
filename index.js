require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./db');
const { Configuration, OpenAIApi } = require('openai');

// ================= CONFIGURACIÓN =================
const TIMEZONE = process.env.TIMEZONE || 'America/Argentina/Buenos_Aires';
const OPENAI_KEY = process.env.OPENAI_KEY;
const PORT = process.env.PORT || 8080;
// En Railway, RAILWAY_STATIC_URL ya incluye el dominio, pero necesitamos asegurar que tenga https://
let DOMAIN = process.env.RAILWAY_STATIC_URL || process.env.DOMAIN;
if (DOMAIN && !DOMAIN.startsWith('http')) {
    DOMAIN = `https://${DOMAIN}`;
}

const aiClient = OPENAI_KEY
  ? new OpenAIApi(new Configuration({ apiKey: OPENAI_KEY }))
  : null;

// ================= SERVIDOR EXPRESS =================
const app = express();
app.use(express.json()); // Necesario para procesar webhooks

app.get('/', (_, res) => res.send('Bot online 🚀'));

// El servidor de Express escucha primero
app.listen(PORT, () => {
    console.log(`🌐 Servidor HTTP escuchando en el puerto ${PORT}`);
});

// ================= BOT CONFIG =================
const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= IA PARSER =================
async function parseReminderWithAI(message) {
  if (!aiClient) return null;

  const prompt = `
Recibí un mensaje de un usuario que puede contener un recordatorio.
Analiza el texto y extrae:

1. La fecha y hora exacta en formato "YYYY-MM-DD HH:mm" (hora local de Buenos Aires).
2. El texto del recordatorio.
3. Las etiquetas si hay (como #trabajo, #estudio) separadas por coma.

Si no es un recordatorio, responde "NO".

Mensaje: """${message}"""
Formato de salida JSON: { "date": "...", "texto": "...", "tags": "..." }
`;

  try {
    const response = await aiClient.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0
    });

    const content = response.data.choices[0].message.content;
    const json = content.includes('{') ? JSON.parse(content.match(/\{[\s\S]*\}/)[0]) : null;
    return json;
  } catch (err) {
    console.error('❌ Error AI parser:', err.message || err);
    return null;
  }
}

// ================= HELPERS =================
function extractTags(text) {
  const matches = text.match(/#[\w]+/g);
  return matches ? matches.join(',') : '';
}

function cleanText(text) {
  return text.replace(/#[\w]+/g, '').trim();
}

// ================= COMANDOS =================
bot.start(ctx =>
  ctx.reply(`Hola 👋

Ejemplos:
mañana llamar a Juan
nota comprar pintura #trabajo
el próximo lunes ir a la universidad a las 8am #estudio

/list
/notes
/done ID
/delete ID`
  )
);

bot.command('list', async ctx => {
  const reminders = await db.getReminders(ctx.from.id);
  if (!reminders.length) return ctx.reply('📭 Vacío');
  let msg = '';
  reminders.forEach(r => {
    msg += `🆔 ${r.id}\n${r.texto}\n📅 ${moment(r.fecha).tz(TIMEZONE).format('DD/MM HH:mm')}\n\n`;
  });
  ctx.reply(msg);
});

bot.command('notes', async ctx => {
  const notes = await db.getNotes(ctx.from.id);
  if (!notes.length) return ctx.reply('🗒 No hay notas');
  let msg = '';
  notes.forEach(n => {
    msg += `• ${n.texto}`;
    if (n.tags) msg += `\n🏷 ${n.tags}`;
    msg += '\n\n';
  });
  ctx.reply(msg);
});

bot.command('done', async ctx => {
  const id = Number(ctx.message.text.split(' ')[1]);
  const ok = await db.markAsDone(id, ctx.from.id);
  ctx.reply(ok ? '✅ Completado' : '❌ No encontrado');
});

bot.command('delete', async ctx => {
  const id = Number(ctx.message.text.split(' ')[1]);
  const ok = await db.deleteReminder(id, ctx.from.id);
  ctx.reply(ok ? '🗑 Eliminado' : '❌ No encontrado');
});

// ================= MENSAJES =================
bot.on('text', async ctx => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  if (text.toLowerCase().startsWith('nota ')) {
    const raw = text.slice(5);
    await db.createNote(ctx.from.id, cleanText(raw), extractTags(raw));
    return ctx.reply('🗒 Nota guardada');
  }

  const aiResult = await parseReminderWithAI(text);

  if (!aiResult || !aiResult.date || !aiResult.texto) {
    return ctx.reply('❌ No pude entender la fecha o el texto del recordatorio.');
  }

  const id = await db.createReminder(
    ctx.from.id,
    aiResult.texto,
    aiResult.date,
    aiResult.tags
  );

  ctx.reply(`⏰ ${aiResult.texto}\n📅 ${moment(aiResult.date).tz(TIMEZONE).format('DD/MM HH:mm')}\nID ${id}`);
});

// ================= CRON RECORDATORIOS =================
cron.schedule('* * * * *', async () => {
  const due = await db.getDueReminders();
  for (const r of due) {
    await bot.telegram.sendMessage(r.user_id, `⏰ ${r.texto}`);
    await db.markAsSent(r.id);
  }
});

// ================= LANZAMIENTO INTEGRADO =================
if (DOMAIN) {
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;
  
  // 1. Configurar el Webhook en Telegram
  bot.telegram.setWebhook(`${DOMAIN}${secretPath}`)
    .then(() => {
        console.log(`🤖 Webhook configurado en: ${DOMAIN}${secretPath}`);
    });

  // 2. Usar el middleware de Telegraf en Express
  app.use(bot.webhookCallback(secretPath));

} else {
  // Fallback para desarrollo local
  bot.launch().then(() => console.log('🤖 Bot iniciado con Long Polling (Local)'));
}

// ================= MANEJO DE CIERRE =================
process.once('SIGINT', () => {
    console.log('Cerrando bot (SIGINT)...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('Cerrando bot (SIGTERM)...');
    bot.stop('SIGTERM');
});

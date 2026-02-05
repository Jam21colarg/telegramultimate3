require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const chrono = require('chrono-node');
const db = require('./db');
const { Configuration, OpenAIApi } = require('openai');

// ================= CONFIG =================
const TIMEZONE = process.env.TIMEZONE || 'America/Argentina/Buenos_Aires';
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN no definido en .env');
  process.exit(1);
}

// Configuración de OpenAI
const aiClient = OPENAI_KEY
  ? new OpenAIApi(new Configuration({ apiKey: OPENAI_KEY }))
  : null;

// ================= HTTP =================
const app = express();
app.get('/', (_, res) => res.send('Bot online 🚀'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🌐 HTTP escuchando en ${PORT}`));

// ================= BOT =================
const bot = new Telegraf(BOT_TOKEN);
bot.launch().then(() => console.log('🤖 Bot iniciado correctamente'));

// ================= HELPERS =================
function extractTags(text) {
  const matches = text.match(/#[\w]+/g);
  return matches ? matches.join(',') : '';
}

function cleanText(text) {
  return text.replace(/#[\w]+/g, '').trim();
}

// ================= AI PARSER =================
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
    console.error('❌ Error AI parser:', err);
    return null;
  }
}

// ================= PROCESO DE RECORDATORIOS =================
async function processReminder(ctx, text) {
  let aiResult = null;

  if (aiClient) {
    try {
      aiResult = await parseReminderWithAI(text);
    } catch (err) {
      console.error('❌ Error AI parser:', err);
    }
  }

  let date, reminderText, tags;

  if (aiResult && aiResult.date && aiResult.texto) {
    date = moment(aiResult.date).tz(TIMEZONE);
    reminderText = aiResult.texto;
    tags = aiResult.tags || '';
  } else {
    const parsed = chrono.es.parse(text, moment.tz(TIMEZONE).toDate(), { forwardDate: true });
    if (!parsed.length) return ctx.reply('❌ No pude entender la fecha o el texto del recordatorio.');

    date = moment(parsed[0].start.date()).tz(TIMEZONE);
    if (date.isBefore(moment.tz(TIMEZONE))) return ctx.reply('❌ Fecha pasada');

    reminderText = text.replace(parsed[0].text, '').trim();
    tags = extractTags(text);
  }

  const id = await db.createReminder(ctx.from.id, reminderText, date.format('YYYY-MM-DD HH:mm:ss'), tags);
  ctx.reply(`⏰ ${reminderText}\n📅 ${date.format('DD/MM HH:mm')}\nID ${id}`);
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

  await processReminder(ctx, text);
});

// ================= CRON RECORDATORIOS =================
cron.schedule('* * * * *', async () => {
  const due = await db.getDueReminders();
  for (const r of due) {
    await bot.telegram.sendMessage(r.user_id, `⏰ ${r.texto}`);
    await db.markAsSent(r.id);
  }
});

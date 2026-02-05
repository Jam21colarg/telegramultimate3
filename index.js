require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./db');
const { Configuration, OpenAIApi } = require('openai');

const TIMEZONE = process.env.TIMEZONE || 'America/Argentina/Buenos_Aires';
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

// Configuración OpenAI
const aiClient = OPENAI_KEY
  ? new OpenAIApi(new Configuration({ apiKey: OPENAI_KEY }))
  : null;

// ---------- HTTP ----------
const app = express();
app.get('/', (_, res) => res.send('Bot online 🚀'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🌐 HTTP escuchando en ${PORT}`));

// ---------- BOT ----------
const bot = new Telegraf(BOT_TOKEN);
bot.launch().then(() => console.log('🤖 Bot iniciado correctamente'));

// ---------- HELPERS ----------
function extractTags(text) {
  const matches = text.match(/#[\w]+/g);
  return matches ? matches.join(',') : '';
}

function cleanText(text) {
  return text.replace(/#[\w]+/g, '').trim();
}

// ---------- IA PARSER ----------
async function parseReminderWithAI(message) {
  if (!aiClient) return null;

  const prompt = `
Recibí un mensaje que puede contener un recordatorio.
Extrae:
1. Fecha y hora exacta en formato "YYYY-MM-DD HH:mm" (hora de Buenos Aires).
2. Texto del recordatorio.
3. Tags si hay (como #trabajo, #estudio) separados por coma.
Si no es un recordatorio, responde "NO".

Mensaje: """${message}"""
Formato JSON: { "date": "...", "texto": "...", "tags": "..." }
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

// ---------- COMANDOS ----------
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

// ---------- MENSAJES ----------
bot.on('text', async ctx => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  // ---- NOTAS ----
  if (text.toLowerCase().startsWith('nota ')) {
    const raw = text.slice(5);
    await db.createNote(ctx.from.id, cleanText(raw), extractTags(raw));
    return ctx.reply('🗒 Nota guardada');
  }

  // ---- RECORDATORIOS ----
  const aiResult = await parseReminderWithAI(text);
  if (!aiResult || !aiResult.date || !aiResult.texto) {
    return ctx.reply('❌ No pude entender la fecha o el texto del recordatorio.');
  }

  // Formato seguro
  const fecha = moment(aiResult.date).tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
  const tags = aiResult.tags ? aiResult.tags : '';

  try {
    const id = await db.createReminder(ctx.from.id, aiResult.texto, fecha, tags);
    ctx.reply(`⏰ ${aiResult.texto}\n📅 ${moment(fecha).tz(TIMEZONE).format('DD/MM HH:mm')}\nID ${id}`);
  } catch (err) {
    console.error('❌ Error guardando recordatorio:', err);
    ctx.reply('❌ Ocurrió un error guardando el recordatorio.');
  }
});

// ---------- CRON RECORDATORIOS ----------
cron.schedule('* * * * *', async () => {
  const due = await db.getDueReminders();
  for (const r of due) {
    await bot.telegram.sendMessage(r.user_id, `⏰ ${r.texto}`);
    await db.markAsSent(r.id);
  }
});

require('dotenv').config();
const { Telegraf } = require('telegraf');
const chrono = require('chrono-node');
const cron = require('node-cron');
const moment = require('moment-timezone');
const express = require('express');
const db = require('./db'); // tu db.js
const OpenAI = require('openai');

const TIMEZONE = 'America/Argentina/Buenos_Aires';
const OPENAI_KEY = process.env.OPENAI_KEY;
const aiClient = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- HTTP SERVER ----------
const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (_, res) => res.send('Bot online ✅'));
app.listen(PORT, () => console.log(`🌐 HTTP escuchando en ${PORT}`));

// ---------- HELPERS ----------
function extractTags(text) {
  const matches = text.match(/#[a-zA-Z0-9_]+/g);
  return matches ? matches.join(',') : '';
}

function cleanText(text) {
  return text.replace(/#[a-zA-Z0-9_]+/g, '').trim();
}

function parseDate(text) {
  const now = moment.tz(TIMEZONE).toDate();
  const results = chrono.es.parse(text, now, { forwardDate: true });
  if (!results.length) return null;
  return results[0];
}

function formatDate(date) {
  return moment(date).tz(TIMEZONE).format('DD/MM HH:mm');
}

// ---------- BOT COMMANDS ----------
bot.start(ctx =>
  ctx.reply(`Hola 👋

Ejemplos:
mañana llamar a Juan
nota comprar pintura #trabajo

/list - ver recordatorios
/notes - ver notas
/done ID - marcar recordatorio completado
/delete ID - eliminar recordatorio`
));

bot.command('list', async ctx => {
  const reminders = await db.getReminders(ctx.from.id);
  if (!reminders.length) return ctx.reply('📭 No tienes recordatorios');

  let msg = '';
  reminders.forEach(r => {
    msg += `🆔 ${r.id}\n${r.texto}\n📅 ${formatDate(r.fecha)}\n\n`;
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

// ---------- TEXT HANDLER ----------
bot.on('text', async ctx => {
  const msg = ctx.message.text;

  if (msg.startsWith('/')) return;

  // ---- NOTAS ----
  if (msg.toLowerCase().startsWith('nota ')) {
    const raw = msg.slice(5);
    await db.createNote(ctx.from.id, cleanText(raw), extractTags(raw));
    return ctx.reply('🗒 Nota guardada');
  }

  // ---- RECORDATORIOS ----
  const parsed = parseDate(msg);
  if (!parsed) return ctx.reply('No entendí cuándo ⏰');

  const date = moment(parsed.start.date()).tz(TIMEZONE);
  if (date.isBefore(moment())) return ctx.reply('Fecha pasada ❌');

  const texto = cleanText(msg.replace(parsed.text, ''));

  const id = await db.createReminder(
    ctx.from.id,
    texto,
    date.format('YYYY-MM-DD HH:mm:ss'),
    extractTags(msg)
  );

  ctx.reply(`⏰ ${texto}\n${formatDate(date)}\nID ${id}`);

  // ---- OPCIONAL: ANALIZAR CON IA ----
  if (aiClient) {
    try {
      const response = await aiClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: `Analiza este recordatorio y mejora su comprensión: "${msg}"` }]
      });
      const aiText = response.choices[0].message.content;
      console.log('AI:', aiText);
    } catch (err) {
      console.error('Error AI:', err);
    }
  }
});

// ---------- CRON PARA RECORDATORIOS ----------
cron.schedule('* * * * *', async () => {
  const due = await db.getDueReminders();
  for (const r of due) {
    await bot.telegram.sendMessage(r.user_id, `⏰ ${r.texto}`);
    await db.markAsSent(r.id);
  }
});

// ---------- BOT LAUNCH ----------
bot.launch()
  .then(() => console.log('🤖 Bot iniciado correctamente'))
  .catch(err => console.error('❌ Error iniciando bot', err));

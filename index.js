require('dotenv').config();
const { Telegraf } = require('telegraf');
const chrono = require('chrono-node');
const cron = require('node-cron');
const moment = require('moment-timezone');
const express = require('express');
const db = require('./db');

const TIMEZONE = 'America/Argentina/Buenos_Aires';

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------------- HTTP SERVER ----------------

const app = express();

app.get('/', (req, res) => res.send('Bot online ✅'));

const PORT = process.env.PORT || 8080;
app.listen(PORT);

// ---------------- NLP HELPERS ----------------

function extractTags(text) {
  const matches = text.match(/#\w+/g);
  return matches ? matches.join(',') : null;
}

function cleanTextFromTags(text) {
  return text.replace(/#\w+/g, '').trim();
}

function parseNaturalDate(text) {
  const now = moment.tz(TIMEZONE).toDate();
  const results = chrono.es.parse(text, now, { forwardDate: true });

  if (!results.length) return null;

  return {
    date: results[0].start.date(),
    matchedText: results[0].text
  };
}

function formatDate(date) {
  return moment(date).tz(TIMEZONE).format('DD/MM/YYYY HH:mm');
}

// ---------------- BOT ----------------

bot.start(ctx => ctx.reply(`Hola 👋

Ejemplos:
mañana llamar a Juan
nota comprar pintura #trabajo

/list
/notes
/done <id>
/delete <id>`));

bot.command('list', async ctx => {
  const reminders = await db.getReminders(ctx.from.id, 'pendiente');

  if (!reminders.length) return ctx.reply('📭 Vacío');

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
  const id = parseInt(ctx.message.text.split(' ')[1]);
  const ok = await db.markAsDone(id, ctx.from.id);
  ctx.reply(ok ? '✅' : '❌');
});

bot.command('delete', async ctx => {
  const id = parseInt(ctx.message.text.split(' ')[1]);
  const ok = await db.deleteReminder(id, ctx.from.id);
  ctx.reply(ok ? '🗑' : '❌');
});

bot.on('text', async ctx => {
  const text = ctx.message.text;

  if (text.startsWith('/')) return;

  // ---- NOTES ----
  if (text.toLowerCase().startsWith('nota ')) {
    const raw = text.slice(5);
    const tags = extractTags(raw);
    const clean = cleanTextFromTags(raw);

    await db.createNote(ctx.from.id, clean, tags);
    return ctx.reply('🗒 Nota guardada');
  }

  // ---- REMINDERS ----
  const parsed = parseNaturalDate(text);
  if (!parsed) return ctx.reply('No entendí cuándo');

  const date = moment(parsed.date).tz(TIMEZONE);
  if (date.isBefore(moment())) return ctx.reply('Fecha pasada');

  const reminderText = cleanTextFromTags(text.replace(parsed.matchedText, ''));

  const id = await db.createReminder(
    ctx.from.id,
    reminderText,
    date.format('YYYY-MM-DD HH:mm:ss')
  );

  ctx.reply(`⏰ ${reminderText}\n${formatDate(date)}\nID ${id}`);
});

// -------- CRON --------

cron.schedule('* * * * *', async () => {
  const due = await db.getDueReminders();

  for (const r of due) {
    await bot.telegram.sendMessage(r.user_id, `⏰ ${r.texto}`);
    await db.markAsSent(r.id);
  }
});

bot.launch();

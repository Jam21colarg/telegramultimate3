require('dotenv').config();
const { Telegraf } = require('telegraf');
const chrono = require('chrono-node');
const cron = require('node-cron');
const moment = require('moment-timezone');
const express = require('express');
const db = require('./db');

const TIMEZONE = 'America/Argentina/Buenos_Aires';

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------------- HTTP ----------------

const app = express();
app.get('/', (_, res) => res.send('Bot online'));
app.listen(process.env.PORT || 8080);

// ---------------- HELPERS ----------------

function extractTags(text) {
  const m = text.match(/#\w+/g);
  return m ? m.map(t => t.replace('#', '')).join(',') : null;
}

function cleanText(text) {
  return text.replace(/#\w+/g, '').trim();
}

function parseDate(text) {
  const results = chrono.es.parse(text, new Date(), { forwardDate: true });
  if (!results.length) return null;

  return {
    date: results[0].start.date(),
    matched: results[0].text
  };
}

function formatDate(d) {
  return moment(d).tz(TIMEZONE).format('DD/MM/YYYY HH:mm');
}

// ---------------- BOT ----------------

bot.start(ctx => ctx.reply(`👋 Hola!

Ejemplos:

nota comprar pintura #trabajo
mañana llamar a Juan

/list
/notes
/done <id>
/delete <id>`));

bot.command('notes', async ctx => {
  const notes = await db.getNotes(ctx.from.id);
  if (!notes.length) return ctx.reply('No hay notas');

  let msg = '🗒 Notas:\n\n';

  notes.forEach(n => {
    msg += `• ${n.texto}`;
    if (n.tags) msg += ` (${n.tags})`;
    msg += '\n';
  });

  ctx.reply(msg);
});

bot.command('list', async ctx => {
  const reminders = await db.getReminders(ctx.from.id);

  if (!reminders.length) return ctx.reply('Vacío');

  let msg = '⏰ Recordatorios:\n\n';

  reminders.forEach(r => {
    msg += `🆔${r.id} ${r.texto}\n📅 ${formatDate(r.fecha)}\n\n`;
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

  const tags = extractTags(text);
  const clean = cleanText(text);

  // NOTES
  if (text.toLowerCase().startsWith('nota')) {
    const content = clean.replace(/^nota/i, '').trim();
    await db.createNote(ctx.from.id, content, tags);
    return ctx.reply('🗒 Nota guardada');
  }

  /

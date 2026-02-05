require('dotenv').config();
const { Telegraf } = require('telegraf');
const chrono = require('chrono-node');
const cron = require('node-cron');
const moment = require('moment-timezone');
const express = require('express');
const db = require('./db');

const TIMEZONE = 'America/Argentina/Buenos_Aires';
const PORT = process.env.PORT || 8080;

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- HTTP SERVER ----------
const app = express();
app.get('/', (_, res) => res.send('🤖 Bot online ✅'));
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

function format(date) {
  return moment(date).tz(TIMEZONE).format('DD/MM HH:mm');
}

// ---------- BOT ----------
bot.start(ctx =>
  ctx.reply(`Hola 👋

Ejemplos:
mañana llamar a Juan
nota comprar pintura #trabajo
el próximo lunes recordarme ir a la universidad

/list
/notes
/done ID
/delete ID`)
);

bot.command('list', async ctx => {
  const rows = await db.getReminders(ctx.from.id);
  if (!rows.length) return ctx.reply('📭 Vacío');

  let m = '';
  rows.forEach(r => {
    m += `🆔 ${r.id}\n${r.texto}\n📅 ${format(r.fecha)}\n\n`;
  });

  ctx.reply(m);
});

bot.command('notes', async ctx => {
  const rows = await db.getNotes(ctx.from.id);
  if (!rows.length) return ctx.reply('🗒 Sin notas');

  let m = '';
  rows.forEach(n => {
    m += `• ${n.texto}\n`;
    if (n.tags) m += `🏷 ${n.tags}\n`;
    m += '\n';
  });

  ctx.reply(m);
});

bot.command('done', async ctx => {
  const id = Number(ctx.message.text.split(' ')[1]);
  const ok = await db.markAsDone(id, ctx.from.id);
  ctx.reply(ok ? '✅ Recordatorio completado' : '❌ No encontrado');
});

bot.command('delete', async ctx => {
  const id = Number(ctx.message.text.split(' ')[1]);
  const ok = await db.deleteReminder(id, ctx.from.id);
  ctx.reply(ok ? '🗑 Recordatorio eliminado' : '❌ No encontrado');
});

// ---------- TEXT HANDLER ----------
bot.on('text', async ctx => {
  const msg = ctx.message.text;

  if (msg.startsWith('/')) return;

  // ---- NOTES ----
  if (msg.toLowerCase().startsWith('nota ')) {
    const raw = msg.slice(5);
    const tags = extractTags(raw);
    const text = cleanText(raw);
    await db.createNote(ctx.from.id, text, tags);
    return ctx.reply('🗒 Nota guardada');
  }

  // ---- REMINDERS ----
  const parsed = parseDate(msg);
  if (!parsed) return ctx.reply('No entendí cuándo ⏰');

  let reminderText = msg.replace(parsed.text, '').trim();
  reminderText = reminderText.replace(/^(recordar|recordarme|recuérdame|avisar|avisarme|avísame)\s*/i, '');
  if (!reminderText) reminderText = msg;

  const tags = extractTags(reminderText);
  reminderText = cleanText(reminderText);

  const date = moment(parsed.start.date()).tz(TIMEZONE);
  if (date.isBefore(moment())) return ctx.reply('Fecha pasada ❌');

  const id = await db.createReminder(
    ctx.from.id,
    reminderText,
    date.format('YYYY-MM-DD HH:mm:ss'),
    tags
  );

  ctx.reply(`⏰ ${reminderText}\n${format(date)}\nID ${id}`);
});

// ---------- CRON ----------
cron.schedule('* * * * *', async () => {
  const due = await db.getDueReminders();
  for (const r of due) {
    await bot.telegram.sendMessage(r.user_id, `⏰ ${r.texto}`);
    await db.markAsSent(r.id);
  }
});

// ---------- START BOT ----------
bot.launch().then(() => console.log('🤖 Bot iniciado correctamente'));

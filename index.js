require('dotenv').config();
const { Telegraf } = require('telegraf');
const chrono = require('chrono-node');
const cron = require('node-cron');
const moment = require('moment-timezone');
const express = require('express');
const db = require('./db');

const TIMEZONE = 'America/Argentina/Buenos_Aires';

if (!process.env.BOT_TOKEN) {
  console.error('❌ Error: BOT_TOKEN no está definido en .env');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------------- HTTP SERVER (Railway + UptimeRobot) ----------------

const app = express();

app.get('/', (req, res) => {
  res.send('Bot online ✅');
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🌐 HTTP server listening on ${PORT}`);
});

// ------------------------------------------------------------------

const customChrono = chrono.casual.clone();
customChrono.parsers.push({
  pattern: () => /./,
  extract: () => null,
});

function parseNaturalDate(text) {
  const now = moment.tz(TIMEZONE).toDate();
  const results = chrono.es.parse(text, now, { forwardDate: true });

  if (results.length > 0) {
    const parsedDate = results[0].start.date();
    return {
      date: parsedDate,
      matchedText: results[0].text,
      remainingText: text.replace(results[0].text, '').trim()
    };
  }

  return null;
}

function extractReminderText(originalText, dateText) {
  let texto = originalText
    .replace(dateText, '')
    .replace(/^(recordar|recordarme|recuérdame|avisar|avisarme|avísame)/i, '')
    .trim();

  if (!texto) {
    texto = originalText;
  }

  return texto;
}

function formatDate(date) {
  return moment(date).tz(TIMEZONE).format('DD/MM/YYYY HH:mm');
}

function getRelativeTimeText(date) {
  const now = moment.tz(TIMEZONE);
  const targetDate = moment(date).tz(TIMEZONE);
  const diffMinutes = targetDate.diff(now, 'minutes');
  const diffHours = targetDate.diff(now, 'hours');
  const diffDays = targetDate.diff(now, 'days');

  if (diffMinutes < 60) return `en ${diffMinutes} minutos`;
  if (diffHours < 24) return `en ${diffHours} horas`;
  if (diffDays === 0) return `hoy a las ${targetDate.format('HH:mm')}`;
  if (diffDays === 1) return `mañana a las ${targetDate.format('HH:mm')}`;

  return `el ${targetDate.format('DD/MM')} a las ${targetDate.format('HH:mm')}`;
}

// ---------------- BOT ----------------

bot.start((ctx) => {
  ctx.reply(`👋 ¡Hola! Soy tu asistente de recordatorios.

Ejemplos:
• "mañana a las 10 llamar a Juan"
• "en 2 horas enviar presupuesto"
• "viernes pagar alquiler"

/list
/done <id>
/delete <id>`);
});

bot.help((ctx) => {
  ctx.reply(`🤖 Ayuda

/list
/done <id>
/delete <id>

Zona horaria Argentina`);
});

bot.command('list', async (ctx) => {
  const reminders = await db.getReminders(ctx.from.id, 'pendiente');

  if (!reminders.length) return ctx.reply('📭 No tienes recordatorios.');

  let msg = '📋 Pendientes:\n\n';

  reminders.forEach(r => {
    msg += `🆔 ${r.id}\n${r.texto}\n📅 ${formatDate(r.fecha)}\n\n`;
  });

  ctx.reply(msg);
});

bot.command('done', async (ctx) => {
  const id = parseInt(ctx.message.text.split(' ')[1]);
  if (!id) return ctx.reply('Uso: /done <id>');

  const ok = await db.markAsDone(id, ctx.from.id);
  ctx.reply(ok ? '✅ Listo' : '❌ No encontrado');
});

bot.command('delete', async (ctx) => {
  const id = parseInt(ctx.message.text.split(' ')[1]);
  if (!id) return ctx.reply('Uso: /delete <id>');

  const ok = await db.deleteReminder(id, ctx.from.id);
  ctx.reply(ok ? '🗑 Eliminado' : '❌ No encontrado');
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith('/')) return;

  const parsed = parseNaturalDate(text);

  if (!parsed) return ctx.reply('No entendí cuándo ⏰');

  const reminderText = extractReminderText(text, parsed.matchedText);
  const date = moment(parsed.date).tz(TIMEZONE);

  if (date.isBefore(moment())) return ctx.reply('Fecha pasada ❌');

  const id = await db.createReminder(
    ctx.from.id,
    reminderText,
    date.format('YYYY-MM-DD HH:mm:ss')
  );

  ctx.reply(`✅ Guardado\n${reminderText}\n${formatDate(date)}\nID ${id}`);
});

// -------- CRON --------

async function checkReminders() {
  const due = await db.getDueReminders();

  for (const r of due) {
    await bot.telegram.sendMessage(r.user_id, `⏰ ${r.texto}`);
    await db.markAsSent(r.id);
  }
}

cron.schedule('* * * * *', checkReminders);

// -------- START --------

bot.launch();

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());

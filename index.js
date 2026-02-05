require('dotenv').config();
const { Telegraf } = require('telegraf');
const chrono = require('chrono-node');
const cron = require('node-cron');
const moment = require('moment-timezone');
const express = require('express');
const db = require('./db');
const { Configuration, OpenAIApi } = require('openai');

const TIMEZONE = 'America/Argentina/Buenos_Aires';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// Inicializamos IA solo si hay API key
const aiClient = OPENAI_KEY ? new OpenAIApi(new Configuration({ apiKey: OPENAI_KEY })) : null;

// ---------------- BOT ----------------
const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------------- HTTP ----------------
const app = express();
app.get('/', (_, res) => res.send('🤖 Bot online'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🌐 HTTP escuchando en ${PORT}`));

// ---------------- HELPERS ----------------
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

// ---------------- BOT COMANDOS ----------------
bot.start(ctx => {
  ctx.reply(`Hola 👋

Ejemplos:
- mañana a las 10 llamar a Juan
- el lunes ir a la universidad
- nota comprar pintura #trabajo

Comandos:
/list - ver recordatorios
/notes - ver notas
/done <ID> - marcar recordatorio completado
/delete <ID> - borrar recordatorio
`);
});

bot.command('list', async ctx => {
  const reminders = await db.getReminders(ctx.from.id);
  if (!reminders.length) return ctx.reply('📭 No tienes recordatorios');
  let msg = '';
  reminders.forEach(r => {
    msg += `🆔 ${r.id}\n${r.texto}\n📅 ${format(r.fecha)}\n\n`;
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
  ctx.reply(ok ? '✅ Recordatorio completado' : '❌ No encontrado');
});

bot.command('delete', async ctx => {
  const id = Number(ctx.message.text.split(' ')[1]);
  const ok = await db.deleteReminder(id, ctx.from.id);
  ctx.reply(ok ? '🗑 Recordatorio eliminado' : '❌ No encontrado');
});

// ---------------- BOT MENSAJES ----------------
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
  let parsed = parseDate(msg);
  
  // Si hay IA, analizamos para mejorar parseo
  if (!parsed && aiClient) {
    try {
      const response = await aiClient.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Extrae la fecha y hora de este recordatorio en español' },
          { role: 'user', content: msg }
        ]
      });
      const dateText = response.data.choices[0].message.content;
      parsed = parseDate(dateText); // parseamos la respuesta de IA
    } catch(e) {
      console.error('❌ Error IA:', e.message);
    }
  }

  if (!parsed) return ctx.reply('❌ No entendí cuándo');

  const date = moment(parsed.start.date()).tz(TIMEZONE);
  if (date.isBefore(moment())) return ctx.reply('❌ Fecha pasada');

  const reminderText = cleanText(msg.replace(parsed.text, ''));
  const tags = extractTags(msg);

  const id = await db.createReminder(ctx.from.id, reminderText, date.format('YYYY-MM-DD HH:mm:ss'), tags);
  ctx.reply(`⏰ ${reminderText}\n📅 ${format(date)}\nID ${id}`);
});

// ---------------- CRON ----------------
cron.schedule('* * * * *', async () => {
  const due = await db.getDueReminders();
  for (const r of due) {
    await bot.telegram.sendMessage(r.user_id, `⏰ ${r.texto}`);
    await db.markAsSent(r.id);
  }
});

// ---------------- START ----------------
bot.launch().then(() => console.log('🤖 Bot iniciado correctamente'));

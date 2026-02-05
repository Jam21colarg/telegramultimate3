require('dotenv').config();
const { Telegraf } = require('telegraf');
const chrono = require('chrono-node');
const cron = require('node-cron');
const moment = require('moment-timezone');
const express = require('express');
const db = require('./db');

const TIMEZONE = 'America/Argentina/Buenos_Aires';
const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- HTTP SERVER ----------
const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (_, res) => res.send('🤖 Bot online ✅'));
app.listen(PORT, () => console.log(`🌐 HTTP escuchando en ${PORT}`));

// ---------- HELPERS ----------

// Extrae hashtags y devuelve string "tag1,tag2" o ""
function extractTags(text) {
  const matches = text.match(/#\w+/g);
  return matches ? matches.join(',') : '';
}

// Limpia texto de hashtags
function cleanText(text) {
  return text.replace(/#\w+/g, '').trim();
}

// Parse de fechas naturales usando chrono-node
function parseDate(text) {
  const now = moment.tz(TIMEZONE).toDate();
  const results = chrono.es.parse(text, now, { forwardDate: true });
  if (!results.length) return null;
  return results[0]; // Devuelve objeto con start.date() y .text
}

// Formatea fecha legible
function format(date) {
  return moment(date).tz(TIMEZONE).format('DD/MM HH:mm');
}

// ---------- BOT ----------

bot.start(ctx =>
  ctx.reply(`👋 Hola! Soy tu asistente de recordatorios

Ejemplos:
- mañana llamar a Juan
- el lunes ir a la universidad a las 8 de la mañana
- nota comprar pintura #trabajo

Comandos:
/list     - Listar recordatorios
/notes    - Listar notas
/done ID  - Marcar recordatorio como completado
/delete ID - Eliminar recordatorio`
));

bot.command('list', async ctx => {
  const rows = await db.getReminders(ctx.from.id);
  if (!rows.length) return ctx.reply('📭 No tienes recordatorios');

  let msg = '';
  rows.forEach(r => {
    msg += `🆔 ${r.id}\n${r.texto}\n📅 ${format(r.fecha)}\n`;
    if (r.tags) msg += `🏷 ${r.tags}\n`;
    msg += '\n';
  });
  ctx.reply(msg);
});

bot.command('notes', async ctx => {
  const rows = await db.getNotes(ctx.from.id);
  if (!rows.length) return ctx.reply('🗒 No hay notas');

  let msg = '';
  rows.forEach(n => {
    msg += `• ${n.texto}\n`;
    if (n.tags) msg += `🏷 ${n.tags}\n`;
    msg += '\n';
  });
  ctx.reply(msg);
});

bot.command('done', async ctx => {
  const id = Number(ctx.message.text.split(' ')[1]);
  if (!id) return ctx.reply('Uso: /done ID');

  const ok = await db.markAsDone(id, ctx.from.id);
  ctx.reply(ok ? '✅ Completado' : '❌ No encontrado');
});

bot.command('delete', async ctx => {
  const id = Number(ctx.message.text.split(' ')[1]);
  if (!id) return ctx.reply('Uso: /delete ID');

  const ok = await db.deleteReminder(id, ctx.from.id);
  ctx.reply(ok ? '🗑 Eliminado' : '❌ No encontrado');
});

// ---------- MENSAJES DE TEXTO ----------
bot.on('text', async ctx => {
  const msg = ctx.message.text;

  if (msg.startsWith('/')) return;

  // ---- NOTAS ----
  if (msg.toLowerCase().startsWith('nota ')) {
    const raw = msg.slice(5);
    const text = cleanText(raw);
    const tags = extractTags(raw);
    await db.createNote(ctx.from.id, text, tags);
    return ctx.reply('🗒 Nota guardada');
  }

  // ---- RECORDATORIOS ----
  const parsed = parseDate(msg);
  if (!parsed) return ctx.reply('❌ No entendí la fecha/hora');

  const date = moment(parsed.start.date()).tz(TIMEZONE);
  if (date.isBefore(moment())) return ctx.reply('❌ La fecha ya pasó');

  // Extrae el texto real del recordatorio sin la fecha ni hashtags
  const reminderText = cleanText(msg.replace(parsed.text, ''));

  try {
    const id = await db.createReminder(
      ctx.from.id,
      reminderText || parsed.text, // Si no hay texto limpio, usar parsed.text
      date.format('YYYY-MM-DD HH:mm:ss'),
      extractTags(msg)
    );
    ctx.reply(`⏰ Recordatorio guardado\n${reminderText}\n📅 ${format(date)}\nID ${id}`);
  } catch (err) {
    console.error('Error creando recordatorio:', err);
    ctx.reply('❌ Ocurrió un error al guardar el recordatorio');
  }
});

// ---------- CRON: ENVÍO DE RECORDATORIOS ----------
cron.schedule('* * * * *', async () => {
  try {
    const due = await db.getDueReminders();
    for (const r of due) {
      await bot.telegram.sendMessage(r.user_id, `⏰ ${r.texto}`);
      await db.markAsSent(r.id);
    }
  } catch (err) {
    console.error('Error en cron de recordatorios:', err);
  }
});

// ---------- INICIO ----------
bot.launch()
  .then(() => console.log('🤖 Bot iniciado correctamente'))
  .catch(err => console.error('Error iniciando bot:', err));

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());

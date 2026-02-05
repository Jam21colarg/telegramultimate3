require('dotenv').config();
const { Telegraf } = require('telegraf');
const chrono = require('chrono-node');
const cron = require('node-cron');
const moment = require('moment-timezone');
const express = require('express');
const db = require('./db');

const TIMEZONE = 'America/Argentina/Buenos_Aires';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// -------- OpenAI opcional --------
let aiClient = null;
if (OPENAI_KEY) {
  try {
    const { Configuration, OpenAIApi } = require('openai');
    const configuration = new Configuration({ apiKey: OPENAI_KEY });
    aiClient = new OpenAIApi(configuration);
    console.log('🤖 OpenAI listo');
  } catch (e) {
    console.warn('⚠️ OpenAI no inicializado:', e.message);
  }
}

// -------- Bot Telegram --------
const bot = new Telegraf(process.env.BOT_TOKEN);

// -------- HTTP Server (para Railway) --------
const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (_, res) => res.send('🤖 Bot online'));
app.listen(PORT, () => console.log(`🌐 HTTP escuchando en ${PORT}`));

// -------- Helpers --------
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

// -------- Bot Commands --------
bot.start(ctx => ctx.reply(`Hola 👋
Ejemplos:
mañana llamar a Juan
nota comprar pintura #trabajo

/list - ver recordatorios
/notes - ver notas
/done ID - marcar completado
/delete ID - borrar recordatorio
`));

bot.command('list', async ctx => {
  try {
    const reminders = await db.getReminders(ctx.from.id);
    if (!reminders.length) return ctx.reply('📭 Vacío');
    let msg = reminders.map(r => `🆔 ${r.id}\n${r.texto}\n📅 ${formatDate(r.fecha)}`).join('\n\n');
    ctx.reply(msg);
  } catch (e) {
    ctx.reply('❌ Error listando recordatorios');
  }
});

bot.command('notes', async ctx => {
  try {
    const notes = await db.getNotes(ctx.from.id);
    if (!notes.length) return ctx.reply('🗒 Sin notas');
    let msg = notes.map(n => `• ${n.texto}${n.tags ? `\n🏷 ${n.tags}` : ''}`).join('\n\n');
    ctx.reply(msg);
  } catch (e) {
    ctx.reply('❌ Error listando notas');
  }
});

bot.command('done', async ctx => {
  const id = Number(ctx.message.text.split(' ')[1]);
  if (!id) return ctx.reply('❌ Debes indicar un ID');
  const ok = await db.markAsDone(id, ctx.from.id);
  ctx.reply(ok ? '✅ Marcado como completado' : '❌ No encontrado');
});

bot.command('delete', async ctx => {
  const id = Number(ctx.message.text.split(' ')[1]);
  if (!id) return ctx.reply('❌ Debes indicar un ID');
  const ok = await db.deleteReminder(id, ctx.from.id);
  ctx.reply(ok ? '🗑 Borrado' : '❌ No encontrado');
});

// -------- Mensajes de texto --------
bot.on('text', async ctx => {
  const msg = ctx.message.text;
  if (msg.startsWith('/')) return;

  try {
    // Notas
    if (msg.toLowerCase().startsWith('nota ')) {
      const raw = msg.slice(5);
      const tags = extractTags(raw);
      const text = cleanText(raw);
      await db.createNote(ctx.from.id, text, tags);
      return ctx.reply('🗒 Nota guardada');
    }

    // Recordatorios
    let parsed = parseDate(msg);
    
    // Si está OpenAI, intentar analizar con IA para fechas más complejas
    if (!parsed && aiClient) {
      const prompt = `Extrae fecha, hora y acción de este texto: "${msg}"`;
      const resp = await aiClient.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }]
      });
      const aiText = resp.data.choices[0].message.content;
      parsed = parseDate(aiText); // Intentamos parsear el texto que la IA nos devuelve
    }

    if (!parsed) return ctx.reply('❌ No entendí cuándo');

    const date = moment(parsed.start.date()).tz(TIMEZONE);
    if (date.isBefore(moment())) return ctx.reply('❌ Fecha pasada');

    const text = cleanText(msg.replace(parsed.text, ''));
    const tags = extractTags(msg);

    const id = await db.createReminder(ctx.from.id, text, date.format('YYYY-MM-DD HH:mm:ss'), tags);
    ctx.reply(`⏰ ${text}\n📅 ${formatDate(date)}\nID ${id}`);
  } catch (e) {
    console.error('❌ Error procesando mensaje:', e);
    ctx.reply('❌ Ocurrió un error al procesar tu mensaje');
  }
});

// -------- Cron para recordatorios --------
cron.schedule('* * * * *', async () => {
  try {
    const due = await db.getDueReminders();
    for (const r of due) {
      await bot.telegram.sendMessage(r.user_id, `⏰ ${r.texto}`);
      await db.markAsSent(r.id);
    }
  } catch (e) {
    console.error('❌ Error en cron recordatorios:', e);
  }
});

// -------- Lanzar bot --------
bot.launch().then(() => console.log('🤖 Bot iniciado correctamente'));

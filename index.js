require('dotenv').config();
const { Telegraf } = require('telegraf');
const { Configuration, OpenAIApi } = require('openai');
const cron = require('node-cron');
const moment = require('moment-timezone');
const express = require('express');
const db = require('./db');

const TIMEZONE = 'America/Argentina/Buenos_Aires';
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

const bot = new Telegraf(BOT_TOKEN);

// Inicializamos OpenAI si hay API key
const aiClient = OPENAI_KEY ? new OpenAIApi(new Configuration({ apiKey: OPENAI_KEY })) : null;

// ---------- HTTP ----------
const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (_, res) => res.send('Bot online ✅'));
app.listen(PORT, () => console.log(`🌐 HTTP escuchando en ${PORT}`));

// ---------- FUNCIONES UTILES ----------
function format(date) {
  return moment(date).tz(TIMEZONE).format('DD/MM HH:mm');
}

async function processWithAI(text) {
  if (!aiClient) return { parsedText: text, date: null, tags: '' };

  try {
    const prompt = `
Extrae de este texto:
- Qué es la acción o recordatorio
- Fecha y hora exacta en formato YYYY-MM-DD HH:mm si hay
- Tags (palabras con #)
Devuelve JSON con { "texto": "...", "fecha": "...", "tags": "..." }
Texto: """${text}"""
`;

    const resp = await aiClient.createChatCompletion({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0
    });

    const aiText = resp.data.choices[0].message.content.trim();
    return JSON.parse(aiText);
  } catch (err) {
    console.error('❌ Error AI:', err);
    return { parsedText: text, date: null, tags: '' };
  }
}

// ---------- BOT ----------
bot.start(ctx => ctx.reply(`
Hola 👋
Ejemplos:
- "Mañana ir a la universidad a las 8 am"
- "nota comprar pintura #trabajo"

Comandos:
- /list -> lista tus recordatorios
- /notes -> lista tus notas
- /done <ID> -> marcar recordatorio como completado
- /delete <ID> -> eliminar recordatorio
`));

bot.command('list', async ctx => {
  const reminders = await db.getReminders(ctx.from.id);
  if (!reminders.length) return ctx.reply('📭 Vacío');

  let msg = '';
  reminders.forEach(r => {
    msg += `🆔 ${r.id}\n${r.texto}\n📅 ${format(r.fecha)}\n🏷 ${r.tags || ''}\n\n`;
  });

  ctx.reply(msg);
});

bot.command('notes', async ctx => {
  const notes = await db.getNotes(ctx.from.id);
  if (!notes.length) return ctx.reply('🗒 Sin notas');

  let msg = '';
  notes.forEach(n => {
    msg += `• ${n.texto}\n`;
    if (n.tags) msg += `🏷 ${n.tags}\n`;
    msg += '\n';
  });

  ctx.reply(msg);
});

bot.command('done', async ctx => {
  const id = parseInt(ctx.message.text.split(' ')[1]);
  const ok = await db.markAsDone(id, ctx.from.id);
  ctx.reply(ok ? '✅ Completado' : '❌ No encontrado');
});

bot.command('delete', async ctx => {
  const id = parseInt(ctx.message.text.split(' ')[1]);
  const ok = await db.deleteReminder(id, ctx.from.id);
  ctx.reply(ok ? '🗑 Eliminado' : '❌ No encontrado');
});

// Procesar mensajes de texto
bot.on('text', async ctx => {
  const msg = ctx.message.text;
  if (msg.startsWith('/')) return;

  // notas
  if (msg.toLowerCase().startsWith('nota ')) {
    const raw = msg.slice(5);
    await db.createNote(ctx.from.id, raw, (raw.match(/#[a-zA-Z0-9_]+/g) || []).join(','));
    return ctx.reply('🗒 Nota guardada');
  }

  // recordatorios con IA
  const aiResult = await processWithAI(msg);

  if (!aiResult.fecha) return ctx.reply('No pude entender la fecha');

  const fecha = moment(aiResult.fecha).tz(TIMEZONE);
  if (fecha.isBefore(moment())) return ctx.reply('⏰ Esa fecha ya pasó');

  const id = await db.createReminder(ctx.from.id, aiResult.texto, fecha.format('YYYY-MM-DD HH:mm:ss'), aiResult.tags);
  ctx.reply(`⏰ ${aiResult.texto}\n📅 ${format(fecha)}\nID ${id}\n🏷 ${aiResult.tags || ''}`);
});

// ---------- CRON PARA ENVIAR RECORDATORIOS ----------
cron.schedule('* * * * *', async () => {
  const due = await db.getDueReminders();
  for (const r of due) {
    await bot.telegram.sendMessage(r.user_id, `⏰ ${r.texto}`);
    await db.markAsSent(r.id);
  }
});

bot.launch().then(() => console.log('🤖 Bot iniciado correctamente'));

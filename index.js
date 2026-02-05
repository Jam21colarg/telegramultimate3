require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./db');
const { Configuration, OpenAIApi } = require('openai');

// ================= CONFIGURACIÓN =================
const TIMEZONE = process.env.TIMEZONE || 'America/Argentina/Buenos_Aires';
const OPENAI_KEY = process.env.OPENAI_KEY;
const PORT = process.env.PORT || 8080;
let DOMAIN = process.env.RAILWAY_STATIC_URL || process.env.DOMAIN;
if (DOMAIN && !DOMAIN.startsWith('http')) {
    DOMAIN = `https://${DOMAIN}`;
}

const aiClient = OPENAI_KEY
  ? new OpenAIApi(new Configuration({ apiKey: OPENAI_KEY }))
  : null;

// ================= SERVIDOR EXPRESS =================
const app = express();
app.use(express.json());

app.get('/', (_, res) => res.send('Bot online 🚀'));

app.listen(PORT, () => {
    console.log(`🌐 Servidor HTTP escuchando en el puerto ${PORT}`);
});

// ================= BOT CONFIG =================
const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= IA PARSER (CORREGIDO) =================
async function parseReminderWithAI(message) {
  if (!aiClient) return null;

  // IMPORTANTE: Le pasamos la fecha actual para que sepa cuándo es "mañana"
  const now = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss dddd');
  
  const prompt = `
Eres un asistente experto en extraer recordatorios. 
Fecha actual (hoy): ${now}
Zona horaria: ${TIMEZONE}

Mensaje del usuario: "${message}"

Debes responder ÚNICAMENTE con un objeto JSON válido. 
Si el mensaje es un recordatorio, usa este formato:
{
  "date": "YYYY-MM-DD HH:mm", 
  "texto": "descripción del recordatorio",
  "tags": "etiquetas"
}
Si el usuario no especifica una hora, asume las 09:00.
Si NO es un recordatorio, responde: {"error": "no_es_recordatorio"}

JSON:`;

  try {
    const response = await aiClient.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0
    });

    const content = response.data.choices[0].message.content.trim();
    console.log('🤖 Respuesta de IA:', content); // Para ver qué pasa en los logs de Railway

    // Extraer JSON usando Regex por si la IA agrega texto extra
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const result = JSON.parse(jsonMatch[0]);
    if (result.error) return null;
    
    return result;
  } catch (err) {
    console.error('❌ Error AI parser:', err.message);
    return null;
  }
}

// ================= HELPERS =================
function extractTags(text) {
  const matches = text.match(/#[\w]+/g);
  return matches ? matches.join(',') : '';
}

function cleanText(text) {
  return text.replace(/#[\w]+/g, '').trim();
}

// ================= COMANDOS =================
bot.start(ctx =>
  ctx.reply(`Hola 👋 Soy tu asistente de recordatorios.

Ejemplos:
• mañana llamar a Juan
• nota comprar pintura #hogar
• el lunes ir al médico a las 16:00

Comandos:
/list - Ver recordatorios
/notes - Ver notas
/done ID - Marcar como hecho
/delete ID - Borrar`)
);

bot.command('list', async ctx => {
  const reminders = await db.getReminders(ctx.from.id);
  if (!reminders.length) return ctx.reply('📭 No tienes recordatorios pendientes.');
  let msg = '⏰ **Tus recordatorios:**\n\n';
  reminders.forEach(r => {
    msg += `🆔 ${r.id} | ${r.texto}\n📅 ${moment(r.fecha).tz(TIMEZONE).format('DD/MM HH:mm')}\n\n`;
  });
  ctx.reply(msg);
});

bot.command('notes', async ctx => {
  const notes = await db.getNotes(ctx.from.id);
  if (!notes.length) return ctx.reply('🗒 No hay notas guardadas.');
  let msg = '🗒 **Tus Notas:**\n\n';
  notes.forEach(n => {
    msg += `• ${n.texto}`;
    if (n.tags) msg += ` (🏷 ${n.tags})`;
    msg += '\n\n';
  });
  ctx.reply(msg);
});

bot.command('done', async ctx => {
  const id = Number(ctx.message.text.split(' ')[1]);
  if (!id) return ctx.reply('Usa: /done ID');
  const ok = await db.markAsDone(id, ctx.from.id);
  ctx.reply(ok ? '✅ ¡Recordatorio completado!' : '❌ No encontré ese ID.');
});

bot.command('delete', async ctx => {
  const id = Number(ctx.message.text.split(' ')[1]);
  if (!id) return ctx.reply('Usa: /delete ID');
  const ok = await db.deleteReminder(id, ctx.from.id);
  ctx.reply(ok ? '🗑 Eliminado correctamente.' : '❌ No encontré ese ID.');
});

// ================= PROCESAR MENSAJES =================
bot.on('text', async ctx => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  // Manejo de Notas rápidas
  if (text.toLowerCase().startsWith('nota ')) {
    const raw = text.slice(5);
    await db.createNote(ctx.from.id, cleanText(raw), extractTags(raw));
    return ctx.reply('🗒 Nota guardada con éxito.');
  }

  // Manejo de Recordatorios con IA
  const waitingMsg = await ctx.reply('Pensando... 🤔');
  const aiResult = await parseReminderWithAI(text);

  if (!aiResult || !aiResult.date || !aiResult.texto) {
    return ctx.telegram.editMessageText(ctx.chat.id, waitingMsg.message_id, null, '❌ No pude entender la fecha o el evento. Prueba siendo más específico (ej: "mañana a las 10am...")');
  }

  const id = await db.createReminder(
    ctx.from.id,
    aiResult.texto,
    aiResult.date,
    aiResult.tags
  );

  const fechaFormateada = moment(aiResult.date).tz(TIMEZONE).format('DD/MM [a las] HH:mm');
  ctx.telegram.editMessageText(
    ctx.chat.id, 
    waitingMsg.message_id, 
    null, 
    `✅ Anotado:\n⏰ ${aiResult.texto}\n📅 ${fechaFormateada}\n🆔 ${id}`
  );
});

// ================= CRON (Cada minuto) =================
cron.schedule('* * * * *', async () => {
  const due = await db.getDueReminders();
  for (const r of due) {
    try {
        await bot.telegram.sendMessage(r.user_id, `🔔 **RECORDATORIO:**\n\n${r.texto}`);
        await db.markAsSent(r.id);
    } catch (e) {
        console.error('Error enviando recordatorio:', e.message);
    }
  }
});

// ================= LANZAMIENTO =================
if (DOMAIN) {
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;
  bot.telegram.setWebhook(`${DOMAIN}${secretPath}`)
    .then(() => console.log(`🤖 Webhook configurado en: ${DOMAIN}${secretPath}`));
  app.use(bot.webhookCallback(secretPath));
} else {
  bot.launch().then(() => console.log('🤖 Bot iniciado con Polling'));
}

// ================= CIERRE LIMPIO =================
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

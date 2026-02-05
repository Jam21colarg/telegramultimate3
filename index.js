require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./db');
const OpenAI = require('openai'); // Cambio aquí

// ================= CONFIGURACIÓN =================
const TIMEZONE = process.env.TIMEZONE || 'America/Argentina/Buenos_Aires';
const PORT = process.env.PORT || 8080;
let DOMAIN = process.env.RAILWAY_STATIC_URL || process.env.DOMAIN;
if (DOMAIN && !DOMAIN.startsWith('http')) {
    DOMAIN = `https://${DOMAIN}`;
}

// Nueva forma de inicializar OpenAI (v4+)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

// ================= SERVIDOR EXPRESS =================
const app = express();
app.use(express.json());

app.get('/', (_, res) => res.send('Bot is Alive 🚀')); // Healthcheck para Railway

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor HTTP escuchando en el puerto ${PORT}`);
});

// ================= BOT CONFIG =================
const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= IA PARSER (VERSIÓN v4+) =================
async function parseReminderWithAI(message) {
  if (!process.env.OPENAI_KEY) return { error: 'No hay API Key' };

  const now = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss dddd');
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { 
          role: 'system', 
          content: `Eres un asistente que extrae recordatorios. Hoy es ${now}. Responde solo en JSON.` 
        },
        { 
          role: 'user', 
          content: `Extrae de este mensaje: "${message}". Formato: {"date": "YYYY-MM-DD HH:mm", "texto": "...", "tags": "..."}. Si no es recordatorio: {"error": "no"}` 
        }
      ],
      temperature: 0,
    });

    const content = response.choices[0].message.content.trim();
    console.log('🤖 Respuesta de IA:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const result = JSON.parse(jsonMatch[0]);
    return result.error ? null : result;
  } catch (err) {
    console.error('❌ Error en OpenAI:', err.message);
    return { error: err.message };
  }
}

// ================= COMANDOS =================
bot.start(ctx => ctx.reply('¡Hola! Envíame un recordatorio, por ejemplo: "Mañana a las 10am llamar a Juan"'));

bot.command('list', async ctx => {
  const reminders = await db.getReminders(ctx.from.id);
  if (!reminders.length) return ctx.reply('📭 Sin recordatorios.');
  let msg = '⏰ Tus recordatorios:\n\n';
  reminders.forEach(r => {
    msg += `🆔 ${r.id} | ${r.texto}\n📅 ${moment(r.fecha).tz(TIMEZONE).format('DD/MM HH:mm')}\n\n`;
  });
  ctx.reply(msg);
});

// ================= MENSAJES =================
bot.on('text', async ctx => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  const waitingMsg = await ctx.reply('Procesando... ⏳');

  try {
    const aiResult = await parseReminderWithAI(text);

    if (!aiResult || aiResult.error || !aiResult.date) {
      const errorText = aiResult?.error || 'No entendí la fecha.';
      return ctx.telegram.editMessageText(ctx.chat.id, waitingMsg.message_id, null, `❌ ${errorText}`);
    }

    const id = await db.createReminder(
      ctx.from.id,
      aiResult.texto,
      aiResult.date,
      aiResult.tags
    );

    ctx.telegram.editMessageText(
      ctx.chat.id, 
      waitingMsg.message_id, 
      null, 
      `✅ Guardado:\n⏰ ${aiResult.texto}\n📅 ${aiResult.date}\n🆔 ${id}`
    );
  } catch (e) {
    ctx.reply('Hubo un error interno.');
  }
});

// ================= CRON =================
cron.schedule('* * * * *', async () => {
  const due = await db.getDueReminders();
  for (const r of due) {
    bot.telegram.sendMessage(r.user_id, `🔔 RECORDATORIO: ${r.texto}`).catch(console.error);
    db.markAsSent(r.id).catch(console.error);
  }
});

// ================= LANZAMIENTO =================
if (DOMAIN) {
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;
  bot.telegram.setWebhook(`${DOMAIN}${secretPath}`)
    .then(() => console.log(`🤖 Webhook OK`))
    .catch(console.error);
  app.use(bot.webhookCallback(secretPath));
} else {
  bot.launch().then(() => console.log('🤖 Polling OK'));
}

// Cierre limpio
process.once('SIGINT', () => { server.close(); bot.stop('SIGINT'); });
process.once('SIGTERM', () => { server.close(); bot.stop('SIGTERM'); });

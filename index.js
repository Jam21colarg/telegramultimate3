require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./db');
const OpenAI = require('openai');

// ================= CONFIGURACIÓN =================
const TIMEZONE = process.env.TIMEZONE || 'America/Argentina/Buenos_Aires';
const PORT = process.env.PORT || 8080;
let DOMAIN = process.env.RAILWAY_STATIC_URL || process.env.DOMAIN;

if (DOMAIN && !DOMAIN.startsWith('http')) {
    DOMAIN = `https://${DOMAIN}`;
}

// ================= SERVIDOR EXPRESS (EL ANCLA) =================
const app = express();
app.use(express.json());

// Ruta de Healthcheck: Vital para que Railway mantenga el bot encendido
app.get('/', (req, res) => {
    console.log('--- Healthcheck recibido por Railway ✅ ---');
    res.status(200).send('Bot Online con Groq');
});

// Forzamos la escucha en 0.0.0.0
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor Express activo en puerto ${PORT}`);
});

// ================= CONFIGURACIÓN DE IA (GROQ) =================
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY, 
  baseURL: "https://api.groq.com/openai/v1" 
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= IA PARSER (LLAMA 3 via GROQ) =================
async function parseReminderWithAI(message) {
  const now = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss dddd');
  try {
    const response = await openai.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [
        { 
          role: 'system', 
          content: `Eres un experto en extraer recordatorios. Hoy es ${now}. 
          Responde EXCLUSIVAMENTE con un objeto JSON.
          Formato: {"date": "YYYY-MM-DD HH:mm", "texto": "...", "tags": "..."}.
          Si no es un recordatorio, responde: {"error": "no"}` 
        },
        { role: 'user', content: `Mensaje: "${message}"` }
      ],
      temperature: 0,
    });

    const content = response.choices[0].message.content.trim();
    console.log('🤖 Respuesta Groq:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const res = JSON.parse(jsonMatch[0]);
    return res.error ? null : res;
  } catch (err) {
    console.error('❌ Error en Groq:', err.message);
    return { error: err.message };
  }
}

// ================= COMANDOS DEL BOT =================
bot.start(ctx => ctx.reply('🚀 Bot Activo (Gratis con Groq).\nEnvíame algo como: "Mañana a las 10am llamar al dentista"'));

bot.command('list', async ctx => {
    try {
        const reminders = await db.getReminders(ctx.from.id);
        if (!reminders || !reminders.length) return ctx.reply('📭 No tienes recordatorios pendientes.');
        let msg = '⏰ **Tus Recordatorios:**\n\n';
        reminders.forEach(r => {
            msg += `🆔 ${r.id} | ${r.texto}\n📅 ${moment(r.fecha).format('DD/MM HH:mm')}\n\n`;
        });
        ctx.reply(msg);
    } catch (e) {
        ctx.reply('❌ Error al leer la base de datos.');
    }
});

// ================= PROCESAR TEXTO =================
bot.on('text', async ctx => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  const waiting = await ctx.reply('Procesando con IA... ⏳');
  const res = await parseReminderWithAI(text);

  if (res && res.error) {
    return ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, `❌ Error de IA: ${res.error}`);
  }

  if (!res || !res.date) {
    return ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, '❌ No pude entender la fecha.');
  }

  try {
    const id = await db.createReminder(ctx.from.id, res.texto, res.date, res.tags || '');
    const fechaOk = moment(res.date).format('DD/MM [a las] HH:mm');
    ctx.telegram.editMessageText(
        ctx.chat.id, 
        waiting.message_id, 
        null, 
        `✅ **¡Anotado!**\n\n🔔 ${res.texto}\n📅 ${fechaOk}\n🆔 ${id}`
    );
  } catch (dbErr) {
    ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, '❌ Error al guardar en DB.');
  }
});

// ================= CRON (REVISIÓN CADA MINUTO) =================
cron.schedule('* * * * *', async () => {
  const now = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm');
  try {
    const due = await db.getDueReminders(now);
    if (due && due.length > 0) {
        for (const r of due) {
          await bot.telegram.sendMessage(r.user_id, `🔔 **RECORDATORIO:**\n\n${r.texto}`);
          await db.markAsSent(r.id);
        }
    }
  } catch (e) {
    console.error('Error en Cron:', e.message);
  }
});

// ================= LANZAMIENTO INTEGRADO =================
if (DOMAIN) {
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;
  bot.telegram.setWebhook(`${DOMAIN}${secretPath}`)
    .then(() => console.log('🤖 Webhook de Telegram configurado exitosamente'))
    .catch(err => console.error('❌ Error Webhook:', err));
    
  app.use(bot.webhookCallback(secretPath));
} else {
  bot.launch().then(() => console.log('🤖 Polling activo (Local)'));
}

// ================= MANTENIMIENTO DE PROCESO (KEEP-ALIVE) =================
// Esto evita que el proceso se cierre si no hay actividad
setInterval(() => {
    if (server.listening) {
        // Mantiene el event loop ocupado
    }
}, 600000); // 10 minutos

// Captura de errores globales para evitar cierres inesperados
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

require('dotenv').config();
const { Telegraf } = require('telegraf');
const chrono = require('chrono-node');
const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./db');

const TIMEZONE = 'America/Argentina/Buenos_Aires';

if (!process.env.BOT_TOKEN) {
  console.error('❌ Error: BOT_TOKEN no está definido en .env');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

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

  if (diffMinutes < 60) {
    return `en ${diffMinutes} minutos`;
  } else if (diffHours < 24) {
    return `en ${diffHours} horas`;
  } else if (diffDays === 0) {
    return `hoy a las ${targetDate.format('HH:mm')}`;
  } else if (diffDays === 1) {
    return `mañana a las ${targetDate.format('HH:mm')}`;
  } else {
    return `el ${targetDate.format('DD/MM')} a las ${targetDate.format('HH:mm')}`;
  }
}

bot.start((ctx) => {
  const welcomeMessage = `👋 ¡Hola! Soy tu asistente de recordatorios.

Simplemente escríbeme lo que quieres recordar en lenguaje natural:

💬 Ejemplos:
• "mañana a las 10 recuérdame llamar a Juan"
• "en 2 horas enviar presupuesto"
• "el viernes a las 15 pagar alquiler"
• "recordarme comprar pan a las 18"

📋 Comandos disponibles:
/list - Ver tus recordatorios pendientes
/done <id> - Marcar como completado
/delete <id> - Eliminar recordatorio
/help - Ver esta ayuda

¡Pruébame ahora! 🚀`;

  ctx.reply(welcomeMessage);
});

bot.help((ctx) => {
  const helpMessage = `🤖 Ayuda del Bot de Recordatorios

📝 Uso básico:
Escribe tu recordatorio en lenguaje natural y yo detectaré cuándo quieres que te lo recuerde.

💡 Ejemplos:
• "mañana a las 10 llamar a Juan"
• "en 3 horas revisar correo"
• "el lunes a las 9 reunión"
• "pasado mañana comprar leche"
• "el 15 de marzo pagar impuestos"

⌚ Formatos de tiempo soportados:
• Fechas específicas: "mañana", "el viernes", "el 15 de marzo"
• Horas: "a las 10", "a las 14:30"
• Relativo: "en 2 horas", "en 30 minutos"

📋 Comandos:
/list - Ver recordatorios pendientes
/done <id> - Marcar como completado
/delete <id> - Eliminar recordatorio
/help - Mostrar esta ayuda

🌍 Zona horaria: Argentina (Buenos Aires)`;

  ctx.reply(helpMessage);
});

bot.command('list', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const reminders = await db.getReminders(userId, 'pendiente');

    if (reminders.length === 0) {
      return ctx.reply('📭 No tienes recordatorios pendientes.');
    }

    let message = '📋 Tus recordatorios pendientes:\n\n';

    reminders.forEach((reminder) => {
      const formattedDate = formatDate(reminder.fecha);
      const relativeTime = getRelativeTimeText(reminder.fecha);
      message += `🔔 ID: ${reminder.id}\n`;
      message += `   ${reminder.texto}\n`;
      message += `   📅 ${formattedDate} (${relativeTime})\n\n`;
    });

    message += '\n💡 Usa /done <id> para completar o /delete <id> para eliminar';

    ctx.reply(message);
  } catch (error) {
    console.error('Error al listar recordatorios:', error);
    ctx.reply('❌ Error al obtener tus recordatorios. Intenta de nuevo.');
  }
});

bot.command('done', async (ctx) => {
  try {
    const args = ctx.message.text.split(' ');

    if (args.length < 2) {
      return ctx.reply('❌ Uso: /done <id>\n\nEjemplo: /done 5');
    }

    const id = parseInt(args[1]);

    if (isNaN(id)) {
      return ctx.reply('❌ El ID debe ser un número. Usa /list para ver tus recordatorios.');
    }

    const userId = ctx.from.id;
    const success = await db.markAsDone(id, userId);

    if (success) {
      ctx.reply('✅ Recordatorio marcado como completado');
    } else {
      ctx.reply('❌ No se encontró ese recordatorio o no te pertenece.');
    }
  } catch (error) {
    console.error('Error al marcar como completado:', error);
    ctx.reply('❌ Error al completar el recordatorio. Intenta de nuevo.');
  }
});

bot.command('delete', async (ctx) => {
  try {
    const args = ctx.message.text.split(' ');

    if (args.length < 2) {
      return ctx.reply('❌ Uso: /delete <id>\n\nEjemplo: /delete 5');
    }

    const id = parseInt(args[1]);

    if (isNaN(id)) {
      return ctx.reply('❌ El ID debe ser un número. Usa /list para ver tus recordatorios.');
    }

    const userId = ctx.from.id;
    const success = await db.deleteReminder(id, userId);

    if (success) {
      ctx.reply('🗑️ Recordatorio eliminado');
    } else {
      ctx.reply('❌ No se encontró ese recordatorio o no te pertenece.');
    }
  } catch (error) {
    console.error('Error al eliminar:', error);
    ctx.reply('❌ Error al eliminar el recordatorio. Intenta de nuevo.');
  }
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith('/')) {
    return;
  }

  try {
    const userId = ctx.from.id;
    const parseResult = parseNaturalDate(text);

    if (!parseResult || !parseResult.date) {
      return ctx.reply('🤔 No entendí cuándo recordarte esto.\n\n💡 Prueba con frases como:\n• "mañana a las 10 llamar a Juan"\n• "en 2 horas revisar correo"\n• "el viernes pagar alquiler"');
    }

    const { date, matchedText } = parseResult;
    const reminderText = extractReminderText(text, matchedText);

    if (!reminderText) {
      return ctx.reply('🤔 No entendí qué quieres que te recuerde.\n\n💡 Escribe algo como: "mañana a las 10 llamar a Juan"');
    }

    const now = moment.tz(TIMEZONE);
    const reminderDate = moment(date).tz(TIMEZONE);

    if (reminderDate.isBefore(now)) {
      return ctx.reply('⏰ Esa fecha ya pasó. Por favor, indica una fecha futura.');
    }

    const isDuplicate = await db.checkDuplicate(
      userId,
      reminderText,
      reminderDate.format('YYYY-MM-DD HH:mm:ss')
    );

    if (isDuplicate) {
      return ctx.reply('⚠️ Ya tienes un recordatorio idéntico programado para esa fecha.');
    }

    const reminderId = await db.createReminder(
      userId,
      reminderText,
      reminderDate.format('YYYY-MM-DD HH:mm:ss')
    );

    const relativeTime = getRelativeTimeText(date);
    const formattedDate = formatDate(date);

    ctx.reply(
      `✅ Recordatorio creado\n\n` +
      `📝 ${reminderText}\n` +
      `⏰ Te avisaré ${relativeTime}\n` +
      `📅 ${formattedDate}\n\n` +
      `🆔 ID: ${reminderId}`
    );

  } catch (error) {
    console.error('Error al procesar mensaje:', error);
    ctx.reply('❌ Ocurrió un error al crear el recordatorio. Intenta de nuevo.');
  }
});

async function checkReminders() {
  try {
    const dueReminders = await db.getDueReminders();

    for (const reminder of dueReminders) {
      try {
        await bot.telegram.sendMessage(
          reminder.user_id,
          `⏰ *Recordatorio*\n\n${reminder.texto}`,
          { parse_mode: 'Markdown' }
        );

        await db.markAsSent(reminder.id);
        console.log(`✅ Recordatorio ${reminder.id} enviado a usuario ${reminder.user_id}`);
      } catch (error) {
        console.error(`Error al enviar recordatorio ${reminder.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error al revisar recordatorios:', error);
  }
}

cron.schedule('* * * * *', () => {
  checkReminders();
});

bot.catch((err, ctx) => {
  console.error('Error en el bot:', err);
  ctx.reply('❌ Ocurrió un error inesperado. Por favor, intenta de nuevo.');
});

bot.launch({
  polling: {
    timeout: 30,
    limit: 100
  }
}).then(() => {
  console.log('🤖 Bot iniciado correctamente');
  console.log(`⏰ Zona horaria: ${TIMEZONE}`);
  console.log('📡 Modo: Polling');
  console.log('✅ Listo para recibir mensajes');
});

process.once('SIGINT', () => {
  bot.stop('SIGINT');
  db.close();
});

process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  db.close();
});

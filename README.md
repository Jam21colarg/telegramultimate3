# Bot de Recordatorios para Telegram

Bot profesional tipo Toki/Dola que entiende lenguaje natural en español para crear recordatorios automáticos.

## Características

- **Lenguaje Natural**: Escribe tus recordatorios como hablas normalmente con alguien
- **Detección de Fechas**: Parseo inteligente de fechas y horas en español usando chrono-node
- **Notificaciones Automáticas**: Envía recordatorios en el momento exacto
- **Multiusuario**: Cada usuario tiene sus propios recordatorios
- **Zona Horaria**: Configurado para Argentina (Buenos Aires)
- **Validación de Duplicados**: Evita recordatorios duplicados
- **Base de Datos SQLite**: Almacenamiento persistente y ligero

## Ejemplos de Uso

Simplemente escribe en lenguaje natural:

```
mañana a las 10 recuérdame llamar a Juan
en 2 horas enviar presupuesto
el viernes a las 15 pagar alquiler
recordarme comprar pan a las 18
el 15 de marzo reunión con cliente
pasado mañana a las 9 ir al dentista
```

## Comandos

- `/start` - Iniciar el bot y ver instrucciones
- `/help` - Ver ayuda completa
- `/list` - Ver todos tus recordatorios pendientes
- `/done <id>` - Marcar recordatorio como completado
- `/delete <id>` - Eliminar un recordatorio

## Instalación Local

### 1. Requisitos

- Node.js 16 o superior
- npm o yarn
- Token de bot de Telegram

### 2. Obtener Token de Telegram

1. Habla con [@BotFather](https://t.me/botfather) en Telegram
2. Envía `/newbot` y sigue las instrucciones
3. Copia el token que te proporciona

### 3. Configuración

```bash
# Clonar o descargar el proyecto
cd telegram-reminder-bot

# Instalar dependencias
npm install

# Configurar variables de entorno
# Edita el archivo .env y reemplaza TU_TOKEN_DE_TELEGRAM_AQUI con tu token
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

### 4. Ejecutar

```bash
# Modo desarrollo
npm run dev

# O simplemente
npm start
```

Verás en consola:

```
✅ Base de datos SQLite conectada
✅ Tabla de recordatorios lista
🤖 Bot iniciado correctamente
⏰ Zona horaria: America/Argentina/Buenos_Aires
📡 Modo: Polling
✅ Listo para recibir mensajes
```

## Deploy en Railway

### Opción 1: Deploy desde GitHub

1. Sube tu código a GitHub (asegúrate de NO subir el .env)
2. Ve a [Railway](https://railway.app)
3. Click en "New Project" → "Deploy from GitHub repo"
4. Selecciona tu repositorio
5. Agrega la variable de entorno:
   - `BOT_TOKEN`: Tu token de Telegram
6. Railway detectará automáticamente que es Node.js y ejecutará `npm start`

### Opción 2: Deploy con Railway CLI

```bash
# Instalar Railway CLI
npm i -g @railway/cli

# Login
railway login

# Crear proyecto
railway init

# Agregar variable de entorno
railway variables set BOT_TOKEN=tu_token_aqui

# Deploy
railway up
```

### Configuración de Railway

Railway detectará automáticamente:
- `npm install` para instalar dependencias
- `npm start` como comando de inicio

El bot funcionará 24/7 en la nube.

## Deploy en Render

1. Ve a [Render](https://render.com)
2. Click en "New" → "Background Worker"
3. Conecta tu repositorio de GitHub
4. Configura:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Agrega variable de entorno:
   - `BOT_TOKEN`: Tu token de Telegram
6. Click en "Create Background Worker"

## Deploy en Heroku

```bash
# Instalar Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Crear app
heroku create nombre-de-tu-bot

# Agregar variable de entorno
heroku config:set BOT_TOKEN=tu_token_aqui

# Deploy
git push heroku main

# Ver logs
heroku logs --tail
```

## Estructura del Proyecto

```
telegram-reminder-bot/
├── index.js          # Lógica principal del bot
├── db.js             # Manejo de base de datos SQLite
├── package.json      # Dependencias y scripts
├── .env              # Variables de entorno (NO subir a git)
├── .gitignore        # Archivos a ignorar
├── reminders.db      # Base de datos SQLite (se crea automáticamente)
└── README.md         # Este archivo
```

## Tecnologías Utilizadas

- **telegraf**: Framework para bots de Telegram
- **chrono-node**: Parseo de lenguaje natural para fechas
- **sqlite3**: Base de datos ligera y persistente
- **node-cron**: Programación de tareas periódicas
- **moment-timezone**: Manejo de zonas horarias
- **dotenv**: Gestión de variables de entorno

## Funcionamiento Interno

1. El bot escucha todos los mensajes de texto
2. Usa chrono-node para detectar fechas/horas en español
3. Extrae el texto del recordatorio
4. Valida que la fecha sea futura y no esté duplicada
5. Guarda en SQLite con el user_id
6. Cada minuto, un cron job verifica recordatorios vencidos
7. Envía notificaciones automáticas cuando llega la hora
8. Marca el recordatorio como "enviado"

## Zona Horaria

Por defecto está configurado para **America/Argentina/Buenos_Aires**.

Para cambiar la zona horaria, edita en `index.js`:

```javascript
const TIMEZONE = 'America/Argentina/Buenos_Aires'; // Cambia aquí
```

Zonas horarias disponibles: [Lista completa](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

## Solución de Problemas

### El bot no responde

- Verifica que el `BOT_TOKEN` esté correctamente configurado
- Revisa los logs para ver errores
- Asegúrate de que el bot esté corriendo

### No detecta las fechas

- chrono-node soporta español, pero puede tener limitaciones
- Intenta ser más específico: "mañana a las 10" en vez de "mañana 10"
- Verifica que uses formatos comunes

### Los recordatorios no se envían

- El cron job revisa cada minuto
- Verifica que la fecha guardada sea correcta
- Revisa los logs para ver si hay errores al enviar

### Error de base de datos

- Asegúrate de tener permisos de escritura en el directorio
- Si usas Railway/Render, la base de datos se reiniciará en cada deploy (considera migrar a PostgreSQL para producción seria)

## Mejoras Futuras

- Soporte para más idiomas
- Recordatorios recurrentes (diario, semanal, mensual)
- Integración con PostgreSQL para producción
- Edición de recordatorios existentes
- Categorías y etiquetas
- Exportar/importar recordatorios
- Snooze (posponer recordatorios)
- Notificaciones antes del evento

## Licencia

MIT

## Soporte

Si tienes problemas, verifica:
1. Los logs del bot
2. Que el token sea válido
3. Que tengas Node.js 16+
4. Que todas las dependencias estén instaladas

---

Desarrollado con Node.js + Telegraf + chrono-node

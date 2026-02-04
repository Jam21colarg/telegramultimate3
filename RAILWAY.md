# Guía de Deploy en Railway

Esta guía te llevará paso a paso para tener tu bot corriendo en Railway en menos de 5 minutos.

## Prerequisitos

- Cuenta en [Railway](https://railway.app) (gratis)
- Cuenta en [GitHub](https://github.com) (gratis)
- Tu token de bot de Telegram

## Paso 1: Preparar el repositorio en GitHub

### 1.1. Inicializar Git (si aún no lo has hecho)

```bash
git init
git add .
git commit -m "Initial commit: Bot de recordatorios para Telegram"
```

### 1.2. Crear repositorio en GitHub

1. Ve a [github.com/new](https://github.com/new)
2. Dale un nombre (ej: `telegram-reminder-bot`)
3. Déjalo como **público** o **privado** (Railway funciona con ambos)
4. NO inicialices con README, .gitignore ni licencia
5. Click en "Create repository"

### 1.3. Subir código a GitHub

Copia los comandos que GitHub te muestra y ejecútalos:

```bash
git remote add origin https://github.com/TU_USUARIO/telegram-reminder-bot.git
git branch -M main
git push -u origin main
```

**IMPORTANTE**: Verifica que `.env` NO se haya subido a GitHub. Debe estar en `.gitignore`.

## Paso 2: Deploy en Railway

### 2.1. Crear cuenta en Railway

1. Ve a [railway.app](https://railway.app)
2. Click en "Login" y usa tu cuenta de GitHub para registrarte
3. Autoriza Railway a acceder a tus repositorios

### 2.2. Crear nuevo proyecto

1. En el dashboard de Railway, click en "New Project"
2. Selecciona "Deploy from GitHub repo"
3. Si es tu primera vez, Railway te pedirá permisos:
   - Click en "Configure GitHub App"
   - Selecciona tu repositorio `telegram-reminder-bot`
   - Guarda los cambios
4. De vuelta en Railway, selecciona tu repositorio

**NOTA**: Railway detectará automáticamente que es un proyecto Node.js gracias al `package.json` y configurará todo automáticamente.

### 2.3. Configurar variables de entorno

1. Railway comenzará a hacer deploy automáticamente
2. Haz click en tu proyecto (debería aparecer el nombre del repo)
3. Ve a la pestaña "Variables"
4. Click en "New Variable" o "Raw Editor"
5. Agrega:

```
BOT_TOKEN=tu_token_de_telegram_aqui
```

6. Click en "Add" o guardar

### 2.4. Verificar el deploy

1. Ve a la pestaña "Deployments"
2. Deberías ver el deploy en progreso
3. Espera a que aparezca "Success" con un check verde
4. Click en "View Logs" para ver los logs en vivo

Deberías ver en los logs:

```
✅ Base de datos SQLite conectada
✅ Tabla de recordatorios lista
🤖 Bot iniciado correctamente
⏰ Zona horaria: America/Argentina/Buenos_Aires
📡 Modo: Polling
✅ Listo para recibir mensajes
```

## Paso 3: Probar el bot

1. Abre Telegram
2. Busca tu bot por el nombre que le diste a @BotFather
3. Envía `/start`
4. Prueba con: "mañana a las 10 llamar a Juan"

¡Tu bot debería responder y funcionar correctamente!

## Comandos útiles de Railway

### Ver logs en tiempo real

1. Ve a tu proyecto en Railway
2. Click en la pestaña "Deployments"
3. Click en el deploy activo
4. Verás los logs en tiempo real

### Reiniciar el bot

1. Ve a "Settings"
2. Scroll hasta abajo
3. Click en "Restart Deployment"

### Actualizar el código

Simplemente haz push a GitHub y Railway hará deploy automáticamente:

```bash
git add .
git commit -m "Actualización del bot"
git push
```

Railway detectará el cambio y hará un nuevo deploy automáticamente.

## Solución de problemas

### Error: "Error creating build plan with Railpack"

Si ves este error durante el build:

**Solución:**
1. Ve a Settings en tu proyecto de Railway
2. Scroll hasta la sección "Build"
3. Asegúrate de que "Builder" esté en "Nixpacks" o déjalo en auto-detect
4. Elimina cualquier archivo `railway.json` o `nixpacks.toml` del repositorio
5. Haz un nuevo commit y push:
   ```bash
   git add .
   git commit -m "Fix Railway config"
   git push
   ```
6. Railway detectará automáticamente el proyecto Node.js y funcionará

**Causa:** Railway necesita detectar automáticamente el proyecto basándose en `package.json`. El proyecto ya está configurado correctamente para esto.

### El bot no responde

**Verifica los logs:**
1. Ve a Railway → tu proyecto → Deployments → View Logs
2. Busca errores en rojo

**Causas comunes:**
- Token incorrecto: Verifica que `BOT_TOKEN` esté bien configurado
- El bot no está corriendo: Verifica en logs que diga "Listo para recibir mensajes"

### Error: "BOT_TOKEN no está definido"

1. Ve a Variables en Railway
2. Verifica que existe `BOT_TOKEN`
3. Verifica que no tenga espacios al inicio o final
4. Guarda y haz un redeploy manual (Settings → Restart Deployment)

### Base de datos se borra al redeploy

**Esto es normal en Railway con SQLite**. El sistema de archivos es efímero.

**Opciones:**

1. **Para desarrollo/pruebas**: No hacer nada, SQLite funciona bien
2. **Para producción seria**: Migrar a PostgreSQL (Railway ofrece PostgreSQL gratis también)

**Para usar PostgreSQL en Railway:**
1. Click en "New" → "Database" → "Add PostgreSQL"
2. Railway creará una base de datos automáticamente
3. Modifica `db.js` para usar PostgreSQL en lugar de SQLite
4. Las variables de conexión estarán disponibles automáticamente

### El bot deja de funcionar después de un tiempo

Railway puede poner el servicio en "sleep" si no hay actividad en el plan gratuito.

**Solución:**
- Envía un mensaje al bot al menos una vez cada 24 horas
- O considera el plan de pago de Railway (muy económico)

## Configuración avanzada

### Agregar dominio personalizado (opcional)

Railway no es necesario para este bot ya que usa polling, pero si quieres:

1. Ve a Settings
2. Click en "Generate Domain"
3. Railway te dará un dominio tipo: `bot-production-xxxx.up.railway.app`

### Monitoreo

Railway incluye:
- Uso de CPU
- Uso de memoria
- Logs en tiempo real
- Métricas de deploy

Accede a todo esto desde el dashboard del proyecto.

### Variables adicionales

Si quieres cambiar la zona horaria, agrega en Variables:

```
TZ=America/Argentina/Buenos_Aires
```

## Costos

Railway ofrece:
- **$5 USD de crédito gratis cada mes** (suficiente para este bot)
- El bot consume muy poco (casi siempre está idle)
- Sin tarjeta de crédito requerida para empezar

## Respaldo de datos

Si usas SQLite y quieres hacer respaldo:

1. Los recordatorios se guardan en `reminders.db`
2. Puedes exportar/importar usando comandos adicionales
3. Para producción, considera usar PostgreSQL

## Próximos pasos

- Agrega más features al bot
- Configura PostgreSQL para persistencia real
- Implementa tests
- Agrega logging más avanzado
- Monitorea el uso con Railway dashboard

---

**¿Problemas?** Revisa los logs en Railway. Casi siempre el error está ahí explicado claramente.

**¿Funciona?** ¡Excelente! Ahora tienes un bot 24/7 en la nube sin costo.

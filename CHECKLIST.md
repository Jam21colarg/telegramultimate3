# ✅ Checklist para Deploy en Railway

Sigue esta lista antes de subir a Railway para asegurar que todo funcione correctamente.

## Pre-Deploy

### 1. Archivos del proyecto

- [x] `index.js` - Lógica principal del bot
- [x] `db.js` - Base de datos SQLite
- [x] `package.json` - Con todas las dependencias (Railway detecta automáticamente)
- [x] `.gitignore` - Excluye node_modules, .env y .db
- [x] `.env.example` - Plantilla de variables de entorno
- [x] `README.md` - Documentación general
- [x] `RAILWAY.md` - Guía específica de Railway

### 2. Variables de entorno

- [ ] Tienes tu `BOT_TOKEN` de Telegram
- [ ] El archivo `.env` tiene el token configurado (solo para testing local)
- [ ] El archivo `.env` está en `.gitignore` (NO SUBIR A GITHUB)

### 3. Git y GitHub

- [ ] Git está inicializado (`git init`)
- [ ] Todos los archivos están en commit
- [ ] Repositorio creado en GitHub
- [ ] Código subido a GitHub (`git push`)
- [ ] Verificaste que `.env` NO está en GitHub

### 4. Prueba local (opcional pero recomendado)

- [ ] `npm install` ejecutado correctamente
- [ ] `npm start` inicia el bot sin errores
- [ ] El bot responde en Telegram
- [ ] Puedes crear recordatorios
- [ ] Los recordatorios se guardan en la base de datos

## Deploy en Railway

### 5. Cuenta y proyecto

- [ ] Cuenta creada en Railway
- [ ] Proyecto creado desde GitHub repo
- [ ] Deploy inicial completado

### 6. Configuración

- [ ] Variable `BOT_TOKEN` agregada en Railway
- [ ] Deploy verificado (check verde)
- [ ] Logs muestran "Bot iniciado correctamente"

### 7. Verificación final

- [ ] Bot responde a `/start` en Telegram
- [ ] Bot crea recordatorios correctamente
- [ ] `/list` muestra los recordatorios
- [ ] Los recordatorios se envían a tiempo

## Comandos rápidos

### Preparar para Git

```bash
git init
git add .
git commit -m "Initial commit: Bot de recordatorios"
```

### Subir a GitHub

```bash
git remote add origin https://github.com/TU_USUARIO/telegram-reminder-bot.git
git branch -M main
git push -u origin main
```

### Actualizar después de cambios

```bash
git add .
git commit -m "Descripción del cambio"
git push
```

## Verificación de seguridad

### ⚠️ IMPORTANTE: NO subas estos archivos a GitHub

- `node_modules/` (ya está en .gitignore)
- `.env` (ya está en .gitignore)
- `*.db` (ya está en .gitignore)
- Tokens o credenciales

### ✅ Verifica antes de cada push

```bash
git status
```

Si ves `.env` o archivos `.db` en la lista, DETENTE y verifica tu `.gitignore`.

## Solución rápida de problemas

| Problema | Solución |
|----------|----------|
| "BOT_TOKEN no definido" | Agrega la variable en Railway → Variables |
| Bot no responde | Verifica logs en Railway |
| Deploy falla | Verifica que package.json tenga el script "start" |
| Base de datos vacía después de redeploy | Normal con SQLite, usa PostgreSQL para persistencia |
| Git no sube archivos | Verifica que no estén en .gitignore |

## Listo para Railway

Si todos los checkboxes están marcados:

1. Ve a [railway.app](https://railway.app)
2. Sigue la guía en `RAILWAY.md`
3. Tu bot estará online en menos de 5 minutos

## Soporte

- Documentación: `README.md`
- Guía Railway: `RAILWAY.md`
- Logs: Railway Dashboard → Deployments → View Logs

---

**Consejo**: Guarda este checklist y úsalo cada vez que hagas cambios importantes.

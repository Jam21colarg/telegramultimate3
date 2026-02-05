const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 1. CONFIGURACIÓN DE RUTA (Prioriza el volumen de Railway)
const MOUNT_PATH = '/data'; 
const DB_NAME = 'reminders.db';

let DB_PATH;

// Verificamos si existe la carpeta del volumen
if (fs.existsSync(MOUNT_PATH)) {
    DB_PATH = path.join(MOUNT_PATH, DB_NAME);
    console.log(`📂 Base de datos en volumen persistente: ${DB_PATH}`);
} else {
    DB_PATH = path.join(__dirname, DB_NAME);
    console.log(`💻 Base de datos en modo local: ${DB_PATH}`);
}

const db = new sqlite3.Database(DB_PATH);

// 2. INICIALIZACIÓN ROBUSTA
db.serialize(() => {
  // Crear tabla principal
  db.run(`CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    texto TEXT NOT NULL,
    fecha TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    tags TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // PARCHE: Asegurar que la columna 'tags' exista por si la tabla es vieja
  db.run(`ALTER TABLE reminders ADD COLUMN tags TEXT DEFAULT ''`, (err) => {
      if (!err) console.log('✅ Columna "tags" añadida correctamente.');
  });

  console.log('✅ Estructura de DB lista.');
});

// 3. EXPORTACIÓN DE MÉTODOS
module.exports = {
  createReminder: (user_id, texto, fecha, tags = '') => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO reminders (user_id, texto, fecha, tags) VALUES (?,?,?,?)`,
        [user_id, texto, fecha, tags],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  getReminders: (user_id, estado = 'pendiente') => {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM reminders WHERE user_id=? AND estado=? ORDER BY fecha ASC`, [user_id, estado], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  },

  getDueReminders: (currentTime) => {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM reminders WHERE estado='pendiente' AND fecha <= ?`, [currentTime], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  },

  markAsSent: (id) => {
    return new Promise((resolve, reject) => {
      db.run(`UPDATE reminders SET estado='enviado' WHERE id=?`, [id], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }
};

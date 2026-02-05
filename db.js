const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'reminders.db');
const db = new sqlite3.Database(DB_PATH);

// Inicialización inmediata
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    texto TEXT NOT NULL,
    fecha TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    tags TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log('✅ Estructura de DB verificada');
});

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

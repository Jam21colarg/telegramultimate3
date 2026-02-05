const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'reminders.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Error al conectar DB:', err);
        return;
      }
      console.log('✅ Base de datos SQLite conectada');
      this.init();
    });
  }

  init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        texto TEXT NOT NULL,
        fecha DATETIME NOT NULL,
        estado TEXT DEFAULT 'pendiente',
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        texto TEXT NOT NULL,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tablas listas y columnas tags aseguradas');
  }

  createReminder(user_id, texto, fecha, tags = '') {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO reminders (user_id, texto, fecha, tags) VALUES (?,?,?,?)`,
        [user_id, texto, fecha, tags],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  getReminders(user_id, estado = 'pendiente') {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM reminders WHERE user_id=? AND estado=? ORDER BY fecha ASC`,
        [user_id, estado],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });
  }

  // MODIFICADO: Ahora acepta la hora actual desde el index.js para evitar líos de zona horaria
  getDueReminders(currentTime) {
    return new Promise((resolve, reject) => {
      // Si no pasamos hora, usamos la del sistema, pero mejor pasarla desde Moment
      const timeToCompare = currentTime || "datetime('now')";
      this.db.all(
        `SELECT * FROM reminders WHERE estado='pendiente' AND fecha <= ? ORDER BY fecha ASC`,
        [timeToCompare],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });
  }

  markAsSent(id) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE reminders SET estado='enviado' WHERE id=?`,
        [id],
        function(err) {
          if (err) return reject(err);
          resolve(this.changes > 0);
        }
      );
    });
  }

  // ... (tus otros métodos markAsDone, deleteReminder, etc., están perfectos)
}

module.exports = new Database();

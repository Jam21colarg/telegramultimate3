const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'reminders.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) console.error('❌ Error DB:', err);
      else console.log('✅ Base de datos SQLite conectada');
      this.init();
    });
  }

  init() {
    // -------- TABLA REMINDERS --------
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

    // -------- TABLA NOTES --------
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

  // ---------- REMINDERS ----------

  createReminder(user_id, texto, fecha, tags = '') {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO reminders (user_id, texto, fecha, tags) VALUES (?,?,?,?)`,
        [user_id, texto, fecha, tags],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
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

  getDueReminders() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM reminders WHERE estado='pendiente' AND fecha <= datetime('now') ORDER BY fecha ASC`,
        [],
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
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  markAsDone(id, user_id) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE reminders SET estado='completado' WHERE id=? AND user_id=?`,
        [id, user_id],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  deleteReminder(id, user_id) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM reminders WHERE id=? AND user_id=?`,
        [id, user_id],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  // ---------- NOTES ----------

  createNote(user_id, texto, tags = '') {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO notes (user_id, texto, tags) VALUES (?,?,?)`,
        [user_id, texto, tags],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  getNotes(user_id) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM notes WHERE user_id=? ORDER BY created_at DESC`,
        [user_id],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });
  }

  // ---------- Cierra DB ----------
  close() {
    this.db.close((err) => {
      if (err) console.error('❌ Error cerrando DB:', err);
      else console.log('✅ Base de datos cerrada');
    });
  }
}

module.exports = new Database();

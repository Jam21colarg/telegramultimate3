const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'reminders.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error al conectar con la base de datos:', err);
      } else {
        console.log('✅ Base de datos SQLite conectada');
        this.init();
      }
    });
  }

  init() {
    // REMINDERS
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

    // NOTES
    this.db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        texto TEXT NOT NULL,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Tablas listas');
  }

  // ---------------- REMINDERS ----------------

  createReminder(userId, texto, fecha, tags = null) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO reminders (user_id, texto, fecha, estado, tags)
        VALUES (?, ?, ?, 'pendiente', ?)
      `;

      this.db.run(sql, [userId, texto, fecha, tags], function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  getReminders(userId, estado = 'pendiente') {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM reminders WHERE user_id = ? AND estado = ? ORDER BY fecha ASC`,
        [userId, estado],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });
  }

  getDueReminders() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM reminders WHERE estado='pendiente' AND fecha <= datetime('now')`,
        [],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });
  }

  markAsSent(id) {
    return this.run(`UPDATE reminders SET estado='enviado' WHERE id=?`, [id]);
  }

  markAsDone(id, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE reminders SET estado='completado' WHERE id=? AND user_id=?`,
        [id, userId],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  deleteReminder(id, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM reminders WHERE id=? AND user_id=?`,
        [id, userId],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );

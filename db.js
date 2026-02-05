const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'reminders.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) console.error('❌ Error al abrir DB:', err);
      else this.init();
    });
  }

  init() {
    // ----- REMINDERS -----
    this.db.run(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        texto TEXT,
        fecha DATETIME,
        estado TEXT DEFAULT 'pendiente',
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ----- NOTES -----
    this.db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        texto TEXT,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Tablas listas');
  }

  // ---------- REMINDERS ----------

  createReminder(user, texto, fecha, tags = '') {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO reminders (user_id, texto, fecha, tags) VALUES (?, ?, ?, ?)`;
      this.db.run(sql, [user, texto, fecha, tags], function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  getReminders(user) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM reminders WHERE user_id = ? AND estado='pendiente' ORDER BY fecha ASC`;
      this.db.all(sql, [user], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getDueReminders() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM reminders WHERE estado='pendiente' AND fecha <= datetime('now') ORDER BY fecha ASC`;
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  markAsSent(id) {
    const sql = `UPDATE reminders SET estado='enviado' WHERE id=?`;
    this.db.run(sql, [id]);
  }

  markAsDone(id, user) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE reminders SET estado='completado' WHERE id=? AND user_id=?`;
      this.db.run(sql, [id, user], function (err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  deleteReminder(id, user) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM reminders WHERE id=? AND user_id=?`;
      this.db.run(sql, [id, user], function (err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  // ---------- NOTES ----------

  createNote(user, texto, tags = '') {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO notes (user_id, texto, tags) VALUES (?, ?, ?)`;
      this.db.run(sql, [user, texto, tags], function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  getNotes(user) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM notes WHERE user_id=? ORDER BY created_at DESC`;
      this.db.all(sql, [user], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

module.exports = new Database();

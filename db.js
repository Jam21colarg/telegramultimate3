const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'reminders.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, () => {
      this.init();
    });
  }

  init() {
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

    this.db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        texto TEXT,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("✅ Tablas listas");
  }

  // -------- REMINDERS --------

  createReminder(user, text, date, tags = "") {
    return new Promise(r => {
      this.db.run(
        `INSERT INTO reminders (user_id,texto,fecha,tags) VALUES (?,?,?,?)`,
        [user, text, date, tags],
        function () { r(this.lastID); }
      );
    });
  }

  getDueReminders() {
    return new Promise(r => {
      this.db.all(
        `SELECT * FROM reminders WHERE estado='pendiente' AND fecha <= datetime('now')`,
        [],
        (_, rows) => r(rows)
      );
    });
  }

  markAsSent(id) {
    this.db.run(`UPDATE reminders SET estado='enviado' WHERE id=?`, [id]);
  }

  getReminders(user) {
    return new Promise(r => {
      this.db.all(
        `SELECT * FROM reminders WHERE user_id=? AND estado='pendiente'`,
        [user],
        (_, rows) => r(rows)
      );
    });
  }

  markAsDone(id, user) {
    return new Promise(r => {
      this.db.run(
        `UPDATE reminders SET estado='completado' WHERE id=? AND user_id=?`,
        [id, user],
        function () { r(this.changes); }
      );
    });
  }

  deleteReminder(id, user) {
    return new Promise(r => {
      this.db.run(
        `DELETE FROM reminders WHERE id=? AND user_id=?`,
        [id, user],
        function () { r(this.changes); }
      );
    });
  }

  // -------- NOTES --------

  createNote(user, text, tags) {
    this.db.run(
      `INSERT INTO notes (user_id,texto,tags) VALUES (?,?,?)`,
      [user, text, tags.join(',')]
    );
  }

  getNotes(user) {
    return new Promise(r => {
      this.db.all(
        `SELECT * FROM notes WHERE user_id=? ORDER BY created_at DESC`,
        [user],
        (_, rows) => r(rows)
      );
    });
  }
}

module.exports = new Database();

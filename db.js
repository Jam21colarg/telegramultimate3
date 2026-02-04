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
    const sql = `
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        texto TEXT NOT NULL,
        fecha DATETIME NOT NULL,
        estado TEXT DEFAULT 'pendiente',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.run(sql, (err) => {
      if (err) {
        console.error('Error al crear tabla:', err);
      } else {
        console.log('✅ Tabla de recordatorios lista');
      }
    });
  }

  createReminder(userId, texto, fecha) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO reminders (user_id, texto, fecha, estado) VALUES (?, ?, ?, 'pendiente')`;

      this.db.run(sql, [userId, texto, fecha], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  checkDuplicate(userId, texto, fecha) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT COUNT(*) as count
        FROM reminders
        WHERE user_id = ?
        AND texto = ?
        AND fecha = ?
        AND estado = 'pendiente'
      `;

      this.db.get(sql, [userId, texto, fecha], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count > 0);
        }
      });
    });
  }

  getReminders(userId, estado = 'pendiente') {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM reminders
        WHERE user_id = ? AND estado = ?
        ORDER BY fecha ASC
      `;

      this.db.all(sql, [userId, estado], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  getDueReminders() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM reminders
        WHERE estado = 'pendiente'
        AND fecha <= datetime('now')
        ORDER BY fecha ASC
      `;

      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  markAsSent(id) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE reminders SET estado = 'enviado' WHERE id = ?`;

      this.db.run(sql, [id], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  markAsDone(id, userId) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE reminders SET estado = 'completado' WHERE id = ? AND user_id = ?`;

      this.db.run(sql, [id, userId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  deleteReminder(id, userId) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM reminders WHERE id = ? AND user_id = ?`;

      this.db.run(sql, [id, userId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  close() {
    this.db.close((err) => {
      if (err) {
        console.error('Error al cerrar base de datos:', err);
      } else {
        console.log('Base de datos cerrada');
      }
    });
  }
}

module.exports = new Database();

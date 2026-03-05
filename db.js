const { Pool } = require('pg');

// 1. CONFIGURACIÓN DE CONEXIÓN (Render leerá la variable de entorno)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Necesario para la conexión segura con Supabase
  }
});

// 2. INICIALIZACIÓN ROBUSTA (Equivalente a db.serialize de SQLite)
const initDB = async () => {
  try {
    // Crear tabla principal si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        texto TEXT NOT NULL,
        fecha TEXT NOT NULL,
        estado TEXT DEFAULT 'pendiente',
        tags TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // PARCHE: Intentar añadir la columna 'tags' por si la tabla ya existía sin ella
    try {
      await pool.query(`ALTER TABLE reminders ADD COLUMN tags TEXT DEFAULT ''`);
      console.log('✅ Columna "tags" añadida correctamente.');
    } catch (err) {
      // Ignoramos el error si la columna ya existe
    }

    console.log('✅ Estructura de DB en Supabase lista.');
  } catch (err) {
    console.error('❌ Error inicializando Supabase:', err);
  }
};

initDB();

// 3. EXPORTACIÓN DE MÉTODOS (Convertidos a Promesas con Async/Await)
module.exports = {
  createReminder: async (user_id, texto, fecha, tags = '') => {
    try {
      const res = await pool.query(
        `INSERT INTO reminders (user_id, texto, fecha, tags) VALUES ($1, $2, $3, $4) RETURNING id`,
        [user_id, texto, fecha, tags]
      );
      return res.rows[0].id;
    } catch (err) {
      throw err;
    }
  },

  getReminders: async (user_id, estado = 'pendiente') => {
    try {
      const res = await pool.query(
        `SELECT * FROM reminders WHERE user_id=$1 AND estado=$2 ORDER BY fecha ASC`,
        [user_id, estado]
      );
      return res.rows || [];
    } catch (err) {
      throw err;
    }
  },

  getDueReminders: async (currentTime) => {
    try {
      const res = await pool.query(
        `SELECT * FROM reminders WHERE estado='pendiente' AND fecha <= $1`,
        [currentTime]
      );
      return res.rows || [];
    } catch (err) {
      throw err;
    }
  },

  markAsSent: async (id) => {
    try {
      await pool.query(`UPDATE reminders SET estado='enviado' WHERE id=$1`, [id]);
      return true;
    } catch (err) {
      throw err;
    }
  }
};

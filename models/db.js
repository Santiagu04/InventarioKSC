// models/db.js
// Módulo de conexión a MySQL usando mysql2/promise con pool de conexiones.

const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Pool de conexiones a la base de datos MySQL.
 * Se reutiliza en todos los controladores del servidor.
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'inventarioksc',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

// Verificar conexión y aplicar migraciones al iniciar
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Conexión a MySQL establecida correctamente.');

    // Migración compatible con todas las versiones de MySQL
    try {
      await conn.query(
        `ALTER TABLE usuarios ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1`
      );
      console.log('✅ Migración: columna "activo" añadida.');
    } catch (migErr) {
      // Ignorar el error si la columna ya existe (código de error 1060 es ER_DUP_FIELDNAME)
      if (migErr.errno !== 1060 && !migErr.message.includes('Duplicate column name')) {
        console.warn('⚠️ Nota en migración:', migErr.message);
      }
    }

    conn.release();
  } catch (err) {
    console.error('❌ Error fatal de base de datos:', err.message);
    process.exit(1);
  }
})();

module.exports = pool;

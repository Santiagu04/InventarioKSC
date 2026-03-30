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

    // Migración: columnas de categoría en productos_insumos
    for (const col of ['es_taller', 'es_evento', 'es_producto']) {
      try {
        await conn.query(`ALTER TABLE productos_insumos ADD COLUMN ${col} TINYINT(1) NOT NULL DEFAULT 0`);
      } catch (e) { if (e.errno !== 1060) console.warn(`⚠️ ${col}:`, e.message); }
    }

    // Migración: tablas de eventos
    await conn.query(`CREATE TABLE IF NOT EXISTS eventos (
      id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
      nombre       VARCHAR(255) NOT NULL,
      fecha        DATE NOT NULL,
      responsable  VARCHAR(120) NOT NULL,
      estado       ENUM('activo','terminado') NOT NULL DEFAULT 'activo',
      creado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      terminado_en TIMESTAMP NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB`);

    await conn.query(`CREATE TABLE IF NOT EXISTS eventos_items (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      evento_id   INT UNSIGNED NOT NULL,
      producto_id INT UNSIGNED NOT NULL,
      cantidad    INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uq_evento_producto (evento_id, producto_id),
      CONSTRAINT fk_ei_evento   FOREIGN KEY (evento_id)   REFERENCES eventos (id)           ON DELETE CASCADE,
      CONSTRAINT fk_ei_producto FOREIGN KEY (producto_id) REFERENCES productos_insumos (id) ON DELETE RESTRICT
    ) ENGINE=InnoDB`);

    // Migración: convertir cantidad de DECIMAL a INT en eventos_items (tablas ya existentes)
    try {
      await conn.query(
        `ALTER TABLE eventos_items MODIFY COLUMN cantidad INT UNSIGNED NOT NULL DEFAULT 0`
      );
    } catch (e) { if (e.errno !== 1060) console.warn('⚠️ eventos_items.cantidad:', e.message); }

    // Migración: tablas de talleres
    await conn.query(`CREATE TABLE IF NOT EXISTS talleres (
      id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
      tipo_taller    VARCHAR(100) NOT NULL,
      descripcion    TEXT NOT NULL,
      num_asistentes INT UNSIGNED NOT NULL,
      lugar          VARCHAR(255) NOT NULL,
      fecha          DATE NOT NULL,
      responsable    VARCHAR(120) NOT NULL,
      notas          TEXT NULL,
      estado         ENUM('activo','terminado') NOT NULL DEFAULT 'activo',
      creado_en      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      terminado_en   TIMESTAMP NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB`);

    await conn.query(`CREATE TABLE IF NOT EXISTS talleres_items (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      taller_id   INT UNSIGNED NOT NULL,
      producto_id INT UNSIGNED NOT NULL,
      cantidad    INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uq_taller_producto (taller_id, producto_id),
      CONSTRAINT fk_ti_taller   FOREIGN KEY (taller_id)   REFERENCES talleres (id)              ON DELETE CASCADE,
      CONSTRAINT fk_ti_producto FOREIGN KEY (producto_id) REFERENCES productos_insumos (id)     ON DELETE RESTRICT
    ) ENGINE=InnoDB`);

    conn.release();
  } catch (err) {
    console.error('❌ Error fatal de base de datos:', err.message);
    process.exit(1);
  }
})();

module.exports = pool;

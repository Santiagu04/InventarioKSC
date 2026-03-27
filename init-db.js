const fs = require('fs');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config();

async function run() {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || 'Pantone',
      multipleStatements: true
    });

    console.log('✅ Conectado a MySQL');
    
    const schemaSql = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
    await conn.query(schemaSql);
    console.log('✅ schema.sql ejecutado con éxito.');

    const seedSql = fs.readFileSync(path.join(__dirname, 'database', 'seed.sql'), 'utf8');
    await conn.query(seedSql);
    console.log('✅ seed.sql ejecutado con éxito.');

    await conn.end();
    console.log('🚀 Base de datos inicializada.');
  } catch (err) {
    console.error('❌ Error al inicializar:', err);
  }
}

run();

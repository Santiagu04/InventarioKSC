// Script temporal para generar seed.sql con hashes reales de bcrypt
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

(async () => {
    const adminHash = await bcrypt.hash('admin123', 10);
    const auxHash = await bcrypt.hash('aux123', 10);

    const sql = `-- ============================================================
-- InventarioKSC — Datos de prueba (seed)
-- Generado automáticamente con hashes reales de bcrypt
-- ============================================================

USE inventarioksc;

INSERT INTO usuarios (nombre, correo, contrasena_hash, rol) VALUES
(
  'Administrador KSC',
  'admin@ksc.com',
  '${adminHash}',
  'administrador'
),
(
  'Auxiliar KSC',
  'auxiliar@ksc.com',
  '${auxHash}',
  'auxiliar'
);

INSERT INTO productos_insumos (nombre, categoria, cantidad, unidad_medida, precio, stock_minimo, creado_por) VALUES
('Café Geisha 250g',   'Café',   45, 'Unidades', 35000, 10, 1),
('Café Etiopía 500g',  'Café',    8, 'Unidades', 52000, 10, 1),
('Filtros V60',        'Insumo',  0, 'Paquetes',  8000,  5, 1),
('Leche entera 1L',    'Insumo', 30, 'Litros',    4500,  8, 1);
`;

    const outPath = path.join(__dirname, 'database', 'seed.sql');
    fs.writeFileSync(outPath, sql, 'utf8');
    console.log('✅ seed.sql actualizado con hashes reales.');
    console.log('   Admin hash:', adminHash.substring(0, 20) + '...');
    console.log('   Aux hash:  ', auxHash.substring(0, 20) + '...');
})().catch(err => { console.error('Error:', err); process.exit(1); });

const pool = require('../models/db');

(async () => {
    try {
        console.log('--- Convirtiendo cantidades a enteros ---');

        // Alterar columnas a INT
        await pool.query('ALTER TABLE productos_insumos MODIFY cantidad INT NOT NULL DEFAULT 0');
        await pool.query('ALTER TABLE productos_insumos MODIFY stock_minimo INT NOT NULL DEFAULT 0');

        console.log('✅ Columnas cantidad y stock_minimo convertidas a INT.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    }
})();

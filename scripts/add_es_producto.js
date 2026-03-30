const pool = require('../models/db');

(async () => {
    try {
        console.log('--- Añadiendo columna es_producto ---');

        try {
            await pool.query('ALTER TABLE productos_insumos ADD COLUMN es_producto TINYINT(1) DEFAULT 0');
            console.log('✅ es_producto agregado');
        } catch (e) { console.log('⚠️ es_producto ya existía'); }

        console.log('✅ Finalizado');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    }
})();

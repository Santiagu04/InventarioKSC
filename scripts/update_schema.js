const pool = require('../models/db');

(async () => {
    try {
        console.log('--- Actualizando esquema ---');

        try {
            await pool.query('ALTER TABLE productos_insumos ADD COLUMN es_taller TINYINT(1) DEFAULT 0');
            console.log('✅ es_taller agregado');
        } catch (e) { console.log('⚠️ es_taller ya existía'); }

        try {
            await pool.query('ALTER TABLE productos_insumos ADD COLUMN es_evento TINYINT(1) DEFAULT 0');
            console.log('✅ es_evento agregado');
        } catch (e) { console.log('⚠️ es_evento ya existía'); }

        console.log('✅ Finalizado');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    }
})();

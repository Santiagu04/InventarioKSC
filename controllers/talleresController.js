// controllers/talleresController.js
const pool = require('../models/db');

// ─── GET /api/talleres/activos ────────────────────────────────────────────────
const getActivos = async (req, res) => {
    try {
        const [talleres] = await pool.query(
            `SELECT id, tipo_taller, descripcion, num_asistentes, lugar,
                    DATE_FORMAT(fecha,'%Y-%m-%d') AS fecha, responsable, notas, creado_en
             FROM talleres WHERE estado = 'activo' ORDER BY fecha ASC`
        );
        for (const t of talleres) {
            const [items] = await pool.query(
                `SELECT ti.id, ti.cantidad,
                        p.id AS producto_id, p.nombre AS producto_nombre,
                        p.categoria, p.unidad_medida
                 FROM talleres_items ti
                 JOIN productos_insumos p ON ti.producto_id = p.id
                 WHERE ti.taller_id = ? ORDER BY p.nombre ASC`,
                [t.id]
            );
            t.checklist = items;
        }
        return res.json({ ok: true, data: talleres });
    } catch (err) {
        console.error('getActivos (talleres):', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al obtener talleres' });
    }
};

// ─── GET /api/talleres/historial ──────────────────────────────────────────────
const getHistorial = async (req, res) => {
    try {
        const [talleres] = await pool.query(
            `SELECT id, tipo_taller, DATE_FORMAT(fecha,'%Y-%m-%d') AS fecha,
                    responsable, num_asistentes, lugar,
                    DATE_FORMAT(terminado_en,'%d/%m/%Y %H:%i') AS terminado_en
             FROM talleres WHERE estado = 'terminado' ORDER BY terminado_en DESC`
        );
        return res.json({ ok: true, data: talleres });
    } catch (err) {
        console.error('getHistorial (talleres):', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al obtener historial' });
    }
};

// ─── POST /api/talleres — crear taller + checklist (transacción) ──────────────
const crearTaller = async (req, res) => {
    const { tipo_taller, descripcion, num_asistentes, lugar, fecha, responsable, notas, items } = req.body;
    if (!tipo_taller || !num_asistentes || !lugar || !fecha || !responsable) {
        return res.status(400).json({ ok: false, mensaje: 'Tipo, asistentes, lugar, fecha y responsable son obligatorios' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ ok: false, mensaje: 'El checklist no puede estar vacío' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.query(
            'INSERT INTO talleres (tipo_taller, descripcion, num_asistentes, lugar, fecha, responsable, notas) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [tipo_taller.trim(), descripcion || '', Math.round(Number(num_asistentes)), lugar.trim(), fecha, responsable.trim(), notas || null]
        );
        const tallerId = result.insertId;

        for (const item of items) {
            const qty = Math.round(Number(item.cantidad));
            if (!item.producto_id || qty <= 0) continue;

            const [stock] = await conn.query(
                'SELECT id, nombre, cantidad FROM productos_insumos WHERE id = ? FOR UPDATE',
                [item.producto_id]
            );
            if (!stock.length) continue;
            if (Number(stock[0].cantidad) < qty) {
                await conn.rollback();
                return res.status(400).json({
                    ok: false,
                    mensaje: `Stock insuficiente para "${stock[0].nombre}" (disponible: ${stock[0].cantidad})`
                });
            }
            await conn.query(
                'UPDATE productos_insumos SET cantidad = cantidad - ? WHERE id = ?',
                [qty, item.producto_id]
            );
            await conn.query(
                'INSERT INTO talleres_items (taller_id, producto_id, cantidad) VALUES (?, ?, ?)',
                [tallerId, item.producto_id, qty]
            );
        }

        await conn.commit();
        return res.status(201).json({ ok: true, id: tallerId, mensaje: 'Taller creado exitosamente' });
    } catch (err) {
        await conn.rollback();
        console.error('crearTaller:', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al crear el taller' });
    } finally {
        conn.release();
    }
};

// ─── PUT /api/talleres/:id/info — editar datos del taller (admin) ─────────────
const editarInfo = async (req, res) => {
    const { id } = req.params;
    const { tipo_taller, descripcion, num_asistentes, lugar, fecha, responsable, notas } = req.body;
    if (!tipo_taller || !num_asistentes || !lugar || !fecha || !responsable) {
        return res.status(400).json({ ok: false, mensaje: 'Todos los campos obligatorios son requeridos' });
    }
    try {
        const [rows] = await pool.query(
            "SELECT id FROM talleres WHERE id = ? AND estado = 'activo'", [id]
        );
        if (!rows.length) return res.status(404).json({ ok: false, mensaje: 'Taller no encontrado' });
        await pool.query(
            'UPDATE talleres SET tipo_taller=?, descripcion=?, num_asistentes=?, lugar=?, fecha=?, responsable=?, notas=? WHERE id=?',
            [tipo_taller.trim(), descripcion || '', Math.round(Number(num_asistentes)), lugar.trim(), fecha, responsable.trim(), notas || null, id]
        );
        return res.json({ ok: true, mensaje: 'Taller actualizado correctamente' });
    } catch (err) {
        console.error('editarInfo (talleres):', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al actualizar taller' });
    }
};

// ─── POST /api/talleres/:id/items — agregar item al checklist ─────────────────
const agregarItem = async (req, res) => {
    const { id } = req.params;
    const { producto_id, cantidad } = req.body;
    if (!producto_id || !cantidad || Number(cantidad) <= 0) {
        return res.status(400).json({ ok: false, mensaje: 'Producto y cantidad son obligatorios' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [t] = await conn.query(
            "SELECT id FROM talleres WHERE id = ? AND estado = 'activo'", [id]
        );
        if (!t.length) {
            await conn.rollback();
            return res.status(404).json({ ok: false, mensaje: 'Taller no encontrado o ya terminado' });
        }
        const [existing] = await conn.query(
            'SELECT id FROM talleres_items WHERE taller_id = ? AND producto_id = ?',
            [id, producto_id]
        );
        if (existing.length) {
            await conn.rollback();
            return res.status(409).json({ ok: false, mensaje: 'Este producto ya está en el checklist' });
        }

        const qty = Math.round(Number(cantidad));
        const [stock] = await conn.query(
            'SELECT nombre, cantidad FROM productos_insumos WHERE id = ? FOR UPDATE', [producto_id]
        );
        if (!stock.length) {
            await conn.rollback();
            return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });
        }
        if (Number(stock[0].cantidad) < qty) {
            await conn.rollback();
            return res.status(400).json({
                ok: false,
                mensaje: `Stock insuficiente para "${stock[0].nombre}" (disponible: ${stock[0].cantidad})`
            });
        }

        await conn.query(
            'UPDATE productos_insumos SET cantidad = cantidad - ? WHERE id = ?', [qty, producto_id]
        );
        const [ins] = await conn.query(
            'INSERT INTO talleres_items (taller_id, producto_id, cantidad) VALUES (?, ?, ?)',
            [id, producto_id, qty]
        );
        await conn.commit();
        return res.status(201).json({ ok: true, id: ins.insertId, mensaje: 'Producto agregado al checklist' });
    } catch (err) {
        await conn.rollback();
        console.error('agregarItem (talleres):', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al agregar producto' });
    } finally {
        conn.release();
    }
};

// ─── PUT /api/talleres/:id/items/:itemId — editar cantidad ────────────────────
const editarItem = async (req, res) => {
    const { id, itemId } = req.params;
    const { cantidad } = req.body;
    if (!cantidad || Number(cantidad) <= 0) {
        return res.status(400).json({ ok: false, mensaje: 'La cantidad debe ser mayor a 0' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            'SELECT cantidad, producto_id FROM talleres_items WHERE id = ? AND taller_id = ?',
            [itemId, id]
        );
        if (!rows.length) {
            await conn.rollback();
            return res.status(404).json({ ok: false, mensaje: 'Item no encontrado' });
        }

        const oldQty = Math.round(Number(rows[0].cantidad));
        const newQty = Math.round(Number(cantidad));
        const diff   = newQty - oldQty;

        if (diff > 0) {
            const [stock] = await conn.query(
                'SELECT cantidad FROM productos_insumos WHERE id = ? FOR UPDATE', [rows[0].producto_id]
            );
            if (Number(stock[0].cantidad) < diff) {
                await conn.rollback();
                return res.status(400).json({ ok: false, mensaje: 'Stock insuficiente para aumentar la cantidad' });
            }
            await conn.query(
                'UPDATE productos_insumos SET cantidad = cantidad - ? WHERE id = ?', [diff, rows[0].producto_id]
            );
        } else if (diff < 0) {
            await conn.query(
                'UPDATE productos_insumos SET cantidad = cantidad + ? WHERE id = ?',
                [Math.abs(diff), rows[0].producto_id]
            );
        }

        await conn.query('UPDATE talleres_items SET cantidad = ? WHERE id = ?', [newQty, itemId]);
        await conn.commit();
        return res.json({ ok: true, mensaje: 'Cantidad actualizada' });
    } catch (err) {
        await conn.rollback();
        console.error('editarItem (talleres):', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al actualizar cantidad' });
    } finally {
        conn.release();
    }
};

// ─── DELETE /api/talleres/:id/items/:itemId — eliminar item (restaura stock) ──
const eliminarItem = async (req, res) => {
    const { id, itemId } = req.params;

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            'SELECT cantidad, producto_id FROM talleres_items WHERE id = ? AND taller_id = ?',
            [itemId, id]
        );
        if (!rows.length) {
            await conn.rollback();
            return res.status(404).json({ ok: false, mensaje: 'Item no encontrado' });
        }

        await conn.query(
            'UPDATE productos_insumos SET cantidad = cantidad + ? WHERE id = ?',
            [rows[0].cantidad, rows[0].producto_id]
        );
        await conn.query('DELETE FROM talleres_items WHERE id = ?', [itemId]);
        await conn.commit();
        return res.json({ ok: true, mensaje: 'Producto eliminado del checklist' });
    } catch (err) {
        await conn.rollback();
        console.error('eliminarItem (talleres):', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al eliminar del checklist' });
    } finally {
        conn.release();
    }
};

// ─── POST /api/talleres/:id/terminar — terminar taller (admin) ────────────────
const terminarTaller = async (req, res) => {
    const { id } = req.params;
    const { retornos } = req.body;
    if (!Array.isArray(retornos)) {
        return res.status(400).json({ ok: false, mensaje: 'Formato inválido' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [t] = await conn.query(
            "SELECT id FROM talleres WHERE id = ? AND estado = 'activo'", [id]
        );
        if (!t.length) {
            await conn.rollback();
            return res.status(404).json({ ok: false, mensaje: 'Taller no encontrado o ya terminado' });
        }

        for (const ret of retornos) {
            const qty = Math.round(Number(ret.cantidad_retorno));
            if (!ret.item_id || qty <= 0) continue;

            const [item] = await conn.query(
                'SELECT cantidad, producto_id FROM talleres_items WHERE id = ? AND taller_id = ?',
                [ret.item_id, id]
            );
            if (!item.length) continue;

            const devolver = Math.min(qty, Math.round(Number(item[0].cantidad)));
            if (devolver > 0) {
                await conn.query(
                    'UPDATE productos_insumos SET cantidad = cantidad + ? WHERE id = ?',
                    [devolver, item[0].producto_id]
                );
            }
        }

        await conn.query(
            "UPDATE talleres SET estado = 'terminado', terminado_en = NOW() WHERE id = ?", [id]
        );
        await conn.commit();
        return res.json({ ok: true, mensaje: 'Taller terminado correctamente' });
    } catch (err) {
        await conn.rollback();
        console.error('terminarTaller:', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al terminar el taller' });
    } finally {
        conn.release();
    }
};

module.exports = {
    getActivos, getHistorial, crearTaller, editarInfo,
    agregarItem, editarItem, eliminarItem, terminarTaller
};

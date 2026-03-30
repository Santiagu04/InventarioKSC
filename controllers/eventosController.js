// controllers/eventosController.js
const pool = require('../models/db');

// ─── GET /api/eventos/activos ─────────────────────────────────────────────────
const getActivos = async (req, res) => {
    try {
        const [eventos] = await pool.query(
            `SELECT id, nombre, DATE_FORMAT(fecha,'%Y-%m-%d') AS fecha, responsable, creado_en
             FROM eventos WHERE estado = 'activo' ORDER BY fecha ASC`
        );
        for (const ev of eventos) {
            const [items] = await pool.query(
                `SELECT ei.id, ei.cantidad,
                        p.id AS producto_id, p.nombre AS producto_nombre,
                        p.categoria, p.unidad_medida
                 FROM eventos_items ei
                 JOIN productos_insumos p ON ei.producto_id = p.id
                 WHERE ei.evento_id = ? ORDER BY p.nombre ASC`,
                [ev.id]
            );
            ev.checklist = items;
        }
        return res.json({ ok: true, data: eventos });
    } catch (err) {
        console.error('getActivos:', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al obtener eventos' });
    }
};

// ─── GET /api/eventos/historial ───────────────────────────────────────────────
const getHistorial = async (req, res) => {
    try {
        const [eventos] = await pool.query(
            `SELECT id, nombre, DATE_FORMAT(fecha,'%Y-%m-%d') AS fecha, responsable,
                    DATE_FORMAT(terminado_en,'%d/%m/%Y %H:%i') AS terminado_en
             FROM eventos WHERE estado = 'terminado' ORDER BY terminado_en DESC`
        );
        return res.json({ ok: true, data: eventos });
    } catch (err) {
        console.error('getHistorial:', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al obtener historial' });
    }
};

// ─── POST /api/eventos — crear evento + checklist (transacción) ───────────────
const crearEvento = async (req, res) => {
    const { nombre, fecha, responsable, items } = req.body;
    if (!nombre || !fecha || !responsable) {
        return res.status(400).json({ ok: false, mensaje: 'Nombre, fecha y responsable son obligatorios' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ ok: false, mensaje: 'El checklist no puede estar vacío' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.query(
            'INSERT INTO eventos (nombre, fecha, responsable) VALUES (?, ?, ?)',
            [nombre.trim(), fecha, responsable.trim()]
        );
        const eventoId = result.insertId;

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
                'INSERT INTO eventos_items (evento_id, producto_id, cantidad) VALUES (?, ?, ?)',
                [eventoId, item.producto_id, qty]
            );
        }

        await conn.commit();
        return res.status(201).json({ ok: true, id: eventoId, mensaje: 'Evento creado exitosamente' });
    } catch (err) {
        await conn.rollback();
        console.error('crearEvento:', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al crear el evento' });
    } finally {
        conn.release();
    }
};

// ─── PUT /api/eventos/:id/info — editar datos del evento (admin) ──────────────
const editarInfo = async (req, res) => {
    const { id } = req.params;
    const { nombre, fecha, responsable } = req.body;
    if (!nombre || !fecha || !responsable) {
        return res.status(400).json({ ok: false, mensaje: 'Todos los campos son obligatorios' });
    }
    try {
        const [rows] = await pool.query(
            "SELECT id FROM eventos WHERE id = ? AND estado = 'activo'", [id]
        );
        if (!rows.length) return res.status(404).json({ ok: false, mensaje: 'Evento no encontrado' });
        await pool.query(
            'UPDATE eventos SET nombre = ?, fecha = ?, responsable = ? WHERE id = ?',
            [nombre.trim(), fecha, responsable.trim(), id]
        );
        return res.json({ ok: true, mensaje: 'Evento actualizado correctamente' });
    } catch (err) {
        console.error('editarInfo:', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al actualizar evento' });
    }
};

// ─── POST /api/eventos/:id/items — agregar item al checklist ──────────────────
const agregarItem = async (req, res) => {
    const { id } = req.params;
    const { producto_id, cantidad } = req.body;
    if (!producto_id || !cantidad || Number(cantidad) <= 0) {
        return res.status(400).json({ ok: false, mensaje: 'Producto y cantidad son obligatorios' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [ev] = await conn.query(
            "SELECT id FROM eventos WHERE id = ? AND estado = 'activo'", [id]
        );
        if (!ev.length) {
            await conn.rollback();
            return res.status(404).json({ ok: false, mensaje: 'Evento no encontrado o ya terminado' });
        }
        const [existing] = await conn.query(
            'SELECT id FROM eventos_items WHERE evento_id = ? AND producto_id = ?',
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
            'INSERT INTO eventos_items (evento_id, producto_id, cantidad) VALUES (?, ?, ?)',
            [id, producto_id, qty]
        );
        await conn.commit();
        return res.status(201).json({ ok: true, id: ins.insertId, mensaje: 'Producto agregado al checklist' });
    } catch (err) {
        await conn.rollback();
        console.error('agregarItem:', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al agregar producto' });
    } finally {
        conn.release();
    }
};

// ─── PUT /api/eventos/:id/items/:itemId — editar cantidad ─────────────────────
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
            'SELECT cantidad, producto_id FROM eventos_items WHERE id = ? AND evento_id = ?',
            [itemId, id]
        );
        if (!rows.length) {
            await conn.rollback();
            return res.status(404).json({ ok: false, mensaje: 'Item no encontrado' });
        }

        const oldQty = Math.round(Number(rows[0].cantidad));
        const newQty = Math.round(Number(cantidad));
        const diff = newQty - oldQty;

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

        await conn.query('UPDATE eventos_items SET cantidad = ? WHERE id = ?', [newQty, itemId]);
        await conn.commit();
        return res.json({ ok: true, mensaje: 'Cantidad actualizada' });
    } catch (err) {
        await conn.rollback();
        console.error('editarItem:', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al actualizar cantidad' });
    } finally {
        conn.release();
    }
};

// ─── DELETE /api/eventos/:id/items/:itemId — eliminar item (restaura stock) ───
const eliminarItem = async (req, res) => {
    const { id, itemId } = req.params;

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            'SELECT cantidad, producto_id FROM eventos_items WHERE id = ? AND evento_id = ?',
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
        await conn.query('DELETE FROM eventos_items WHERE id = ?', [itemId]);
        await conn.commit();
        return res.json({ ok: true, mensaje: 'Producto eliminado del checklist' });
    } catch (err) {
        await conn.rollback();
        console.error('eliminarItem:', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al eliminar del checklist' });
    } finally {
        conn.release();
    }
};

// ─── POST /api/eventos/:id/terminar — terminar evento (admin) ─────────────────
const terminarEvento = async (req, res) => {
    const { id } = req.params;
    const { retornos } = req.body; // [{item_id, cantidad_retorno}]
    if (!Array.isArray(retornos)) {
        return res.status(400).json({ ok: false, mensaje: 'Formato inválido' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [ev] = await conn.query(
            "SELECT id FROM eventos WHERE id = ? AND estado = 'activo'", [id]
        );
        if (!ev.length) {
            await conn.rollback();
            return res.status(404).json({ ok: false, mensaje: 'Evento no encontrado o ya terminado' });
        }

        for (const ret of retornos) {
            const qty = Number(ret.cantidad_retorno);
            if (!ret.item_id || qty <= 0) continue;

            const [item] = await conn.query(
                'SELECT cantidad, producto_id FROM eventos_items WHERE id = ? AND evento_id = ?',
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
            "UPDATE eventos SET estado = 'terminado', terminado_en = NOW() WHERE id = ?", [id]
        );
        await conn.commit();
        return res.json({ ok: true, mensaje: 'Evento terminado correctamente' });
    } catch (err) {
        await conn.rollback();
        console.error('terminarEvento:', err);
        return res.status(500).json({ ok: false, mensaje: 'Error al terminar el evento' });
    } finally {
        conn.release();
    }
};

module.exports = {
    getActivos, getHistorial, crearEvento, editarInfo,
    agregarItem, editarItem, eliminarItem, terminarEvento
};

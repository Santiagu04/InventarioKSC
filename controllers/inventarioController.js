// controllers/inventarioController.js
// Lógica CRUD para la tabla productos_insumos.

const pool = require('../models/db');

/**
 * GET /api/inventario
 * Retorna todos los productos ordenados por nombre.
 */
const getAll = async (req, res) => {
    try {
        const [filas] = await pool.query(
            `SELECT id, nombre, categoria, cantidad, unidad_medida, precio, stock_minimo,
              ultima_actualizacion
       FROM productos_insumos
       ORDER BY nombre ASC`
        );
        return res.json({ ok: true, data: filas });
    } catch (error) {
        console.error('Error al obtener inventario:', error);
        return res.status(500).json({ ok: false, mensaje: 'Error al obtener inventario' });
    }
};

/**
 * POST /api/inventario
 * Body: { nombre, categoria, cantidad, unidad_medida, precio, stock_minimo }
 * Solo administradores.
 */
const create = async (req, res) => {
    const { nombre, categoria, cantidad, unidad_medida, precio, stock_minimo } = req.body;

    // Validar campos obligatorios
    if (!nombre || !categoria || cantidad === undefined || !unidad_medida ||
        precio === undefined || stock_minimo === undefined) {
        return res.status(400).json({
            ok: false,
            mensaje: 'Por favor completa todos los campos requeridos',
        });
    }

    try {
        // Verificar nombre duplicado
        const [existentes] = await pool.query(
            'SELECT id FROM productos_insumos WHERE LOWER(nombre) = LOWER(?) LIMIT 1',
            [nombre.trim()]
        );

        if (existentes.length > 0) {
            return res.status(409).json({
                ok: false,
                code: 'NOMBRE_DUPLICADO',
                mensaje: 'Ya existe un producto con ese nombre',
            });
        }

        const [resultado] = await pool.query(
            `INSERT INTO productos_insumos (nombre, categoria, cantidad, unidad_medida, precio, stock_minimo, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                nombre.trim(),
                categoria,
                Number(cantidad),
                unidad_medida,
                Number(precio),
                Number(stock_minimo),
                req.session.usuarioId,
            ]
        );

        // Retornar el producto recién creado
        const [nuevo] = await pool.query(
            'SELECT * FROM productos_insumos WHERE id = ?',
            [resultado.insertId]
        );

        return res.status(201).json({ ok: true, data: nuevo[0] });
    } catch (error) {
        console.error('Error al crear producto:', error);
        return res.status(500).json({ ok: false, mensaje: 'Error al registrar producto' });
    }
};

/**
 * PUT /api/inventario/:id
 * Body: { nombre, categoria, cantidad, unidad_medida, precio, stock_minimo }
 * Solo administradores.
 */
const update = async (req, res) => {
    const { id } = req.params;
    const { nombre, categoria, cantidad, unidad_medida, precio, stock_minimo } = req.body;
    const esAuxiliar = req.session.usuarioRol === 'auxiliar';

    if (esAuxiliar) {
        if (cantidad === undefined) {
            return res.status(400).json({ ok: false, mensaje: 'Por favor ingresa la cantidad' });
        }
    } else {
        if (!nombre || !categoria || cantidad === undefined || !unidad_medida ||
            precio === undefined || stock_minimo === undefined) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Por favor completa todos los campos requeridos',
            });
        }
    }

    try {
        // Verificar que el producto exista
        const [existentes] = await pool.query(
            'SELECT id FROM productos_insumos WHERE id = ? LIMIT 1', [id]
        );
        if (existentes.length === 0) {
            return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });
        }

        if (esAuxiliar) {
            await pool.query(
                `UPDATE productos_insumos SET cantidad = ? WHERE id = ?`,
                [Number(cantidad), id]
            );
        } else {
            // Verificar nombre duplicado excluyendo el producto actual
            const [duplicados] = await pool.query(
                'SELECT id FROM productos_insumos WHERE LOWER(nombre) = LOWER(?) AND id <> ? LIMIT 1',
                [nombre.trim(), id]
            );
            if (duplicados.length > 0) {
                return res.status(409).json({
                    ok: false,
                    code: 'NOMBRE_DUPLICADO',
                    mensaje: 'Ya existe un producto con ese nombre',
                });
            }

            await pool.query(
                `UPDATE productos_insumos
           SET nombre = ?, categoria = ?, cantidad = ?, unidad_medida = ?, precio = ?, stock_minimo = ?
           WHERE id = ?`,
                [nombre.trim(), categoria, Number(cantidad), unidad_medida, Number(precio), Number(stock_minimo), id]
            );
        }

        const [actualizado] = await pool.query(
            'SELECT * FROM productos_insumos WHERE id = ?', [id]
        );

        return res.json({ ok: true, data: actualizado[0] });
    } catch (error) {
        console.error('Error al actualizar producto:', error);
        return res.status(500).json({ ok: false, mensaje: 'Error al actualizar producto' });
    }
};

/**
 * DELETE /api/inventario/:id
 * Solo administradores.
 */
const remove = async (req, res) => {
    const { id } = req.params;
    try {
        const [existentes] = await pool.query(
            'SELECT id FROM productos_insumos WHERE id = ? LIMIT 1', [id]
        );
        if (existentes.length === 0) {
            return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });
        }

        await pool.query('DELETE FROM productos_insumos WHERE id = ?', [id]);
        return res.json({ ok: true, mensaje: 'Producto eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar producto:', error);
        return res.status(500).json({ ok: false, mensaje: 'Error al eliminar producto' });
    }
};

module.exports = { getAll, create, update, remove };

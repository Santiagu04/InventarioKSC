// controllers/usuariosController.js
const bcrypt = require('bcrypt');
const pool = require('../models/db');

// GET /api/usuarios
const getAll = async (req, res) => {
    try {
        const [filas] = await pool.query(
            'SELECT id, nombre, correo, rol, activo, creado_en FROM usuarios ORDER BY nombre ASC'
        );
        return res.json({ ok: true, data: filas });
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        return res.status(500).json({ ok: false, mensaje: 'Error al obtener usuarios' });
    }
};

// POST /api/usuarios
const create = async (req, res) => {
    const { nombre, correo, contrasena, rol } = req.body;

    if (!nombre || !correo || !contrasena || !rol) {
        return res.status(400).json({ ok: false, mensaje: 'Todos los campos son obligatorios' });
    }

    if (rol !== 'administrador' && rol !== 'auxiliar') {
        return res.status(400).json({ ok: false, mensaje: 'Rol inválido' });
    }

    try {
        // Verificar correo duplicado
        const [existentes] = await pool.query('SELECT id FROM usuarios WHERE correo = ? LIMIT 1', [correo.trim()]);
        if (existentes.length > 0) {
            return res.status(409).json({ ok: false, mensaje: 'Ya existe un usuario con este correo' });
        }

        const hash = await bcrypt.hash(contrasena, 10);

        const [resultado] = await pool.query(
            'INSERT INTO usuarios (nombre, correo, contrasena_hash, rol) VALUES (?, ?, ?, ?)',
            [nombre.trim(), correo.trim(), hash, rol]
        );

        return res.status(201).json({ ok: true, mensaje: 'Usuario creado exitosamente', id: resultado.insertId });
    } catch (error) {
        console.error('Error al crear usuario:', error);
        return res.status(500).json({ ok: false, mensaje: 'Error interno al crear usuario' });
    }
};

// PUT /api/usuarios/me/password
const changeMyPassword = async (req, res) => {
    const { actual, nueva } = req.body;
    const usuarioId = req.session.usuarioId;

    if (!actual || !nueva) {
        return res.status(400).json({ ok: false, mensaje: 'Debes enviar la contraseña actual y la nueva' });
    }

    try {
        const [filas] = await pool.query('SELECT contrasena_hash FROM usuarios WHERE id = ?', [usuarioId]);
        if (filas.length === 0) {
            return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
        }

        const user = filas[0];
        const coincide = await bcrypt.compare(actual, user.contrasena_hash);

        if (!coincide) {
            return res.status(401).json({ ok: false, mensaje: 'La contraseña actual es incorrecta' });
        }

        const nuevoHash = await bcrypt.hash(nueva, 10);
        await pool.query('UPDATE usuarios SET contrasena_hash = ? WHERE id = ?', [nuevoHash, usuarioId]);

        return res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        return res.status(500).json({ ok: false, mensaje: 'Error al cambiar la contraseña' });
    }
};

// PUT /api/usuarios/:id (Solo para administradores editar otros usuarios)
const updateUser = async (req, res) => {
    const { id } = req.params;
    const { nombre, correo, rol, contrasena } = req.body;

    if (!nombre || !correo || !rol) {
        return res.status(400).json({ ok: false, mensaje: 'Faltan campos obligatorios' });
    }

    try {
        const [existentes] = await pool.query('SELECT id FROM usuarios WHERE correo = ? AND id != ? LIMIT 1', [correo.trim(), id]);
        if (existentes.length > 0) {
            return res.status(409).json({ ok: false, mensaje: 'El correo ya está en uso por otro usuario' });
        }

        if (contrasena && contrasena.trim().length > 0) {
            const hash = await bcrypt.hash(contrasena, 10);
            await pool.query(
                'UPDATE usuarios SET nombre = ?, correo = ?, rol = ?, contrasena_hash = ? WHERE id = ?',
                [nombre.trim(), correo.trim(), rol, hash, id]
            );
        } else {
            await pool.query(
                'UPDATE usuarios SET nombre = ?, correo = ?, rol = ? WHERE id = ?',
                [nombre.trim(), correo.trim(), rol, id]
            );
        }

        return res.json({ ok: true, mensaje: 'Usuario actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        return res.status(500).json({ ok: false, mensaje: 'Error al actualizar usuario' });
    }
};

// PATCH /api/usuarios/:id/toggle
const toggleActivo = async (req, res) => {
    const { id } = req.params;
    const adminId = req.session.usuarioId;

    if (Number(id) === Number(adminId)) {
        return res.status(400).json({ ok: false, mensaje: 'No puedes deshabilitar tu propia cuenta' });
    }

    try {
        const [filas] = await pool.query('SELECT activo FROM usuarios WHERE id = ?', [id]);
        if (filas.length === 0) {
            return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
        }

        const nuevoEstado = filas[0].activo ? 0 : 1;
        await pool.query('UPDATE usuarios SET activo = ? WHERE id = ?', [nuevoEstado, id]);

        return res.json({
            ok: true,
            activo: nuevoEstado,
            mensaje: nuevoEstado ? 'Usuario habilitado correctamente' : 'Usuario deshabilitado correctamente',
        });
    } catch (error) {
        console.error('Error al cambiar estado de usuario:', error);
        return res.status(500).json({ ok: false, mensaje: 'Error interno al cambiar estado' });
    }
};

// DELETE /api/usuarios/:id
const deleteUser = async (req, res) => {
    const { id } = req.params;
    const adminId = req.session.usuarioId;

    if (Number(id) === Number(adminId)) {
        return res.status(400).json({ ok: false, mensaje: 'No puedes eliminar tu propia cuenta' });
    }

    try {
        // Proteger: no eliminar si es el último administrador
        const [filas] = await pool.query('SELECT rol FROM usuarios WHERE id = ?', [id]);
        if (filas.length === 0) {
            return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
        }

        if (filas[0].rol === 'administrador') {
            const [admins] = await pool.query(
                "SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'administrador'"
            );
            if (admins[0].total <= 1) {
                return res.status(400).json({ ok: false, mensaje: 'No puedes eliminar al único administrador del sistema' });
            }
        }

        await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
        return res.json({ ok: true, mensaje: 'Usuario eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        return res.status(500).json({ ok: false, mensaje: 'Error interno al eliminar usuario' });
    }
};

module.exports = { getAll, create, changeMyPassword, updateUser, toggleActivo, deleteUser };

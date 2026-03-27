// controllers/authController.js
// Lógica de autenticación: login, logout y consulta del usuario en sesión.

const bcrypt = require('bcrypt');
const pool = require('../models/db');

/**
 * POST /api/auth/login
 * Body: { correo, contrasena }
 */
const login = async (req, res) => {
    const { correo, contrasena } = req.body;

    // Validación de campos vacíos
    if (!correo || !contrasena) {
        return res.status(400).json({
            ok: false,
            code: 'EMPTY_FIELDS',
            mensaje: 'Por favor ingresa tu correo y contraseña',
        });
    }

    try {
        // Buscar usuario por correo
        const [filas] = await pool.query(
            'SELECT id, nombre, correo, contrasena_hash, rol FROM usuarios WHERE correo = ? LIMIT 1',
            [correo.trim().toLowerCase()]
        );

        if (filas.length === 0) {
            return res.status(401).json({
                ok: false,
                code: 'EMAIL_NOT_FOUND',
                mensaje: 'No encontramos una cuenta con ese correo',
            });
        }

        const usuario = filas[0];

        // Comparar contraseña con el hash almacenado
        const coincide = await bcrypt.compare(contrasena, usuario.contrasena_hash);

        if (!coincide) {
            return res.status(401).json({
                ok: false,
                code: 'WRONG_PASSWORD',
                mensaje: 'Usuario o contraseña incorrectos',
            });
        }

        // Crear sesión
        req.session.usuarioId = usuario.id;
        req.session.usuarioRol = usuario.rol;
        req.session.usuarioNombre = usuario.nombre;

        return res.json({
            ok: true,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                correo: usuario.correo,
                rol: usuario.rol,
            },
        });
    } catch (error) {
        console.error('Error en login:', error);
        return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
    }
};

/**
 * POST /api/auth/logout
 */
const logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ ok: false, mensaje: 'No se pudo cerrar sesión' });
        }
        res.clearCookie('connect.sid');
        return res.json({ ok: true, mensaje: 'Sesión cerrada correctamente' });
    });
};

/**
 * GET /api/auth/me
 * Retorna los datos del usuario autenticado actualmente.
 */
const me = (req, res) => {
    if (!req.session.usuarioId) {
        return res.status(401).json({ ok: false, mensaje: 'No hay sesión activa' });
    }
    return res.json({
        ok: true,
        usuario: {
            id: req.session.usuarioId,
            nombre: req.session.usuarioNombre,
            rol: req.session.usuarioRol,
        },
    });
};

module.exports = { login, logout, me };

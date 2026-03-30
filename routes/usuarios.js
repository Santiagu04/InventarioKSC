// routes/usuarios.js
const express = require('express');
const router = express.Router();
const usuariosCtrl = require('../controllers/usuariosController');

// Middlewares locales para validación
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.usuarioId) {
        return res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesión' });
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (req.session.usuarioRol !== 'administrador') {
        return res.status(403).json({ ok: false, mensaje: 'Acceso denegado. Solo administradores pueden realizar esta acción.' });
    }
    next();
};

// Rutas de administración de usuarios (solo administrador)
router.get('/', requireAuth, requireAdmin, usuariosCtrl.getAll);
router.post('/', requireAuth, requireAdmin, usuariosCtrl.create);
router.put('/:id', requireAuth, requireAdmin, usuariosCtrl.updateUser);
router.patch('/:id/toggle', requireAuth, requireAdmin, usuariosCtrl.toggleActivo);
router.delete('/:id', requireAuth, requireAdmin, usuariosCtrl.deleteUser);

// Ruta para cambiar contraseña propia (habilitado para todos)
router.put('/me/password', requireAuth, usuariosCtrl.changeMyPassword);

module.exports = router;

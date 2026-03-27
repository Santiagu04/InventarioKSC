// routes/inventario.js
// Rutas CRUD de productos_insumos con protección por autenticación y rol.

const express = require('express');
const router = express.Router();
const inventarioCtrl = require('../controllers/inventarioController');

// ── Middlewares ────────────────────────────────────────────

/**
 * requireAuth — verifica que exista una sesión activa.
 */
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.usuarioId) {
        return res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesión para continuar' });
    }
    next();
};

/**
 * requireAdmin — solo permite el acceso a administradores.
 */
const requireAdmin = (req, res, next) => {
    if (req.session.usuarioRol !== 'administrador') {
        return res.status(403).json({ ok: false, mensaje: 'No tienes permisos para esta acción' });
    }
    next();
};

// ── Rutas ──────────────────────────────────────────────────

// GET  /api/inventario          — accesible para cualquier usuario autenticado
router.get('/', requireAuth, inventarioCtrl.getAll);

// POST /api/inventario          — solo administrador
router.post('/', requireAuth, requireAdmin, inventarioCtrl.create);

// PUT  /api/inventario/:id      — administrador y auxiliar
router.put('/:id', requireAuth, inventarioCtrl.update);

// DELETE /api/inventario/:id   — solo administrador
router.delete('/:id', requireAuth, requireAdmin, inventarioCtrl.remove);

module.exports = router;

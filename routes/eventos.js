// routes/eventos.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/eventosController');

const requireAuth = (req, res, next) => {
    if (!req.session?.usuarioId)
        return res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesión' });
    next();
};

const requireAdmin = (req, res, next) => {
    if (req.session.usuarioRol !== 'administrador')
        return res.status(403).json({ ok: false, mensaje: 'Solo administradores pueden realizar esta acción' });
    next();
};

// Rutas estáticas ANTES de las paramétricas (evita que Express las confunda)
router.get('/activos',   requireAuth, ctrl.getActivos);
router.get('/historial', requireAuth, ctrl.getHistorial);

// Crear evento (admin)
router.post('/', requireAuth, requireAdmin, ctrl.crearEvento);

// Editar datos del evento (admin)
router.put('/:id/info', requireAuth, requireAdmin, ctrl.editarInfo);

// Gestión de checklist (admin + auxiliar)
router.post('/:id/items',            requireAuth, ctrl.agregarItem);
router.put('/:id/items/:itemId',     requireAuth, ctrl.editarItem);
router.delete('/:id/items/:itemId',  requireAuth, ctrl.eliminarItem);

// Terminar evento (admin)
router.post('/:id/terminar', requireAuth, requireAdmin, ctrl.terminarEvento);

module.exports = router;

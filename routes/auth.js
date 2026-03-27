// routes/auth.js
// Rutas de autenticación: login, logout y consulta de sesión activa.

const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');

// POST /api/auth/login
router.post('/login', authCtrl.login);

// POST /api/auth/logout
router.post('/logout', authCtrl.logout);

// GET /api/auth/me — retorna el usuario en sesión
router.get('/me', authCtrl.me);

module.exports = router;

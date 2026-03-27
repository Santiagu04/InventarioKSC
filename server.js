// server.js
// Punto de entrada del servidor InventarioKSC.
// Configura Express, sesiones, CORS y monta las rutas de la API.

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const inventarioRoutes = require('./routes/inventario');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware general ─────────────────────────────────────

app.use(cors({
    origin: true,
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Sesión ─────────────────────────────────────────────────
app.use(session({
    secret: process.env.SESSION_SECRET || 'inventarioksc_dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,   // cambiar a true si se usa HTTPS en producción
        maxAge: 8 * 60 * 60 * 1000,  // 8 horas
    },
}));

// ── Archivos estáticos del frontend ───────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Rutas de la API ─────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/inventario', inventarioRoutes);

// ── Rutas de navegación — devuelve el HTML correspondiente ──
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/inventario', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'inventario.html'));
});

app.get('/auxiliar', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'auxiliar.html'));
});

// ── 404 catch-all ─────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ ok: false, mensaje: 'Ruta no encontrada' });
});

// ── Arrancar servidor ──────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 InventarioKSC corriendo en http://localhost:${PORT}`);
});

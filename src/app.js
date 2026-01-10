const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Rutas principales (siempre disponibles)
const authRutas = require('./rutas/autenticacion.rutas');
const catalogosRutas = require('./rutas/catalogos.rutas');
const clientesRutas = require('./rutas/clientes.rutas');
const dashboardRutas = require('./rutas/dashboard.rutas');
const equiposRutas = require('./rutas/equipos.rutas');
const documentosRutas = require('./rutas/documentos.rutas');

app.use('/api/auth', authRutas);
app.use('/api/catalogos', catalogosRutas);
app.use('/api/clientes', clientesRutas);
app.use('/api/dashboard', dashboardRutas);
app.use('/api/equipos', equiposRutas);
app.use('/api/documentos', documentosRutas);

// Rutas opcionales (módulo de cargos y pagos)
try {
  const cargosRutas = require('./rutas/cargos.rutas');
  app.use('/api/cargos', cargosRutas);
  console.log('✅ Módulo de cargos cargado');
} catch (e) {
  console.log('⚠️ Módulo de cargos no disponible:', e.message);
  app.use('/api/cargos', (req, res) => {
    res.status(503).json({ ok: false, mensaje: 'Módulo de cargos no disponible. Ejecute el SQL primero.' });
  });
}

try {
  const pagosRutas = require('./rutas/pagos.rutas');
  app.use('/api/pagos', pagosRutas);
  console.log('✅ Módulo de pagos cargado');
} catch (e) {
  console.log('⚠️ Módulo de pagos no disponible:', e.message);
  app.use('/api/pagos', (req, res) => {
    res.status(503).json({ ok: false, mensaje: 'Módulo de pagos no disponible. Ejecute el SQL primero.' });
  });
}

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'API Skynet funcionando' });
});

module.exports = app;

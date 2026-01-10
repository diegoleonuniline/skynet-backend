const express = require('express');
const cors = require('cors');
const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Rutas principales
const authRutas = require('./rutas/autenticacion.rutas');
const catalogosRutas = require('./rutas/catalogos.rutas');
const clientesRutas = require('./rutas/clientes.rutas');
const dashboardRutas = require('./rutas/dashboard.rutas');
const equiposRutas = require('./rutas/equipos.rutas');
const documentosRutas = require('./rutas/documentos.rutas');
const instalacionesRutas = require('./rutas/instalaciones.rutas');
const pagosRutas = require('./rutas/pagos.rutas');

app.use('/api/auth', authRutas);
app.use('/api/catalogos', catalogosRutas);
app.use('/api/clientes', clientesRutas);
app.use('/api/dashboard', dashboardRutas);
app.use('/api/equipos', equiposRutas);
app.use('/api/documentos', documentosRutas);
app.use('/api/instalaciones', instalacionesRutas);
app.use('/api/pagos', pagosRutas);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'API Skynet funcionando' });
});

// TEMPORAL - Generar hash
app.get('/api/generar-hash/:password', async (req, res) => {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(req.params.password, 10);
  res.json({ password: req.params.password, hash });
});

module.exports = app;

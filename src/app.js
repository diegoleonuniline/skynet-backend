const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
const authRutas = require('./rutas/autenticacion.rutas');
const catalogosRutas = require('./rutas/catalogos.rutas');
const clientesRutas = require('./rutas/clientes.rutas');
const dashboardRutas = require('./rutas/dashboard.rutas');
const pagosRutas = require('./rutas/pagos.rutas');

app.use('/api/auth', authRutas);
app.use('/api/catalogos', catalogosRutas);
app.use('/api/clientes', clientesRutas);
app.use('/api/dashboard', dashboardRutas);
app.use('/api/pagos', pagosRutas);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'API Skynet funcionando' });
});

module.exports = app;

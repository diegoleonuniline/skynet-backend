const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Rutas
const authRutas = require('./rutas/autenticacion.rutas');
const catalogosRutas = require('./rutas/catalogos.rutas');
const clientesRutas = require('./rutas/clientes.rutas');
const dashboardRutas = require('./rutas/dashboard.rutas');
const pagosRutas = require('./rutas/pagos.rutas');
const equiposRutas = require('./rutas/equipos.rutas');
const documentosRutas = require('./rutas/documentos.rutas');

app.use('/api/auth', authRutas);
app.use('/api/catalogos', catalogosRutas);
app.use('/api/clientes', clientesRutas);
app.use('/api/dashboard', dashboardRutas);
app.use('/api/pagos', pagosRutas);
app.use('/api/equipos', equiposRutas);
app.use('/api/documentos', documentosRutas);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'API Skynet funcionando' });
});

module.exports = app;

const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/auth', require('./rutas/auth.rutas'));
app.use('/api/catalogos', require('./rutas/catalogos.rutas'));
app.use('/api/clientes', require('./rutas/clientes.rutas'));
app.use('/api/dashboard', require('./rutas/dashboard.rutas'));
app.use('/api/pagos', require('./rutas/pagos.rutas'));
app.use('/api/equipos', require('./rutas/equipos.rutas'));
app.use('/api/cargos', require('./rutas/cargos.rutas'));

app.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'API Skynet funcionando' });
});

module.exports = app;

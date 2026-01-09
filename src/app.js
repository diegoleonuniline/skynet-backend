const express = require('express');
const cors = require('cors');

const rutasAuth = require('./rutas/autenticacion.rutas');

const app = express();

// CORS (ajustaremos el ORIGEN cuando tengas el front en Heroku)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));

app.get('/salud', (req, res) => {
  res.json({ ok: true, servicio: 'skynet-backend', fecha: new Date().toISOString() });
});

app.use('/api/auth', rutasAuth);

module.exports = app;

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/clientes', require('./routes/clientes.routes'));
app.use('/api/servicios', require('./routes/servicios.routes'));
app.use('/api/pagos', require('./routes/pagos.routes'));
app.use('/api/cargos', require('./routes/cargos.routes'));
app.use('/api/equipos', require('./routes/equipos.routes'));
app.use('/api/instalaciones', require('./routes/instalaciones.routes'));
app.use('/api/catalogos', require('./routes/catalogos.routes'));
app.use('/api/reportes', require('./routes/reportes.routes'));
app.use('/api/usuarios', require('./routes/usuarios.routes'));

app.get('/', (req, res) => res.json({ ok: true, mensaje: 'API Skynet ISP', version: '1.0.0' }));
app.get('/api', (req, res) => res.json({ ok: true, mensaje: 'API Skynet ISP', version: '1.0.0' }));

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, message: 'Error interno' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/database');

const app = express();

// Middlewares
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/', (req, res) => {
    res.json({ 
        ok: true, 
        mensaje: 'API Skynet ISP',
        version: '1.0.0'
    });
});

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true, db: 'connected' });
    } catch (error) {
        res.status(500).json({ ok: false, db: 'disconnected' });
    }
});

// Rutas
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/clientes', require('./routes/clientes.routes'));
app.use('/api/servicios', require('./routes/servicios.routes'));
app.use('/api/instalaciones', require('./routes/instalaciones.routes'));
app.use('/api/equipos', require('./routes/equipos.routes'));
app.use('/api/cargos', require('./routes/cargos.routes'));
app.use('/api/pagos', require('./routes/pagos.routes'));
app.use('/api/usuarios', require('./routes/usuarios.routes'));
app.use('/api/catalogos', require('./routes/catalogos.routes'));
app.use('/api/reportes', require('./routes/reportes.routes'));

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        ok: false, 
        mensaje: 'Error interno del servidor' 
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({ 
        ok: false, 
        mensaje: 'Ruta no encontrada' 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});

module.exports = app;

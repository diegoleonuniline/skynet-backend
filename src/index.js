require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const db = require('./config/database');
const errorHandler = require('./middlewares/errorHandler');

// Routes
const authRoutes = require('./routes/auth.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const clientesRoutes = require('./routes/clientes.routes');
const serviciosRoutes = require('./routes/servicios.routes');
const cargosRoutes = require('./routes/cargos.routes');
const pagosRoutes = require('./routes/pagos.routes');
const catalogosRoutes = require('./routes/catalogos.routes');
const reportesRoutes = require('./routes/reportes.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const historialRoutes = require('./routes/historial.routes');

const app = express();

// Security
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Demasiadas solicitudes, intente más tarde' }
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Skynet ISP API v1.0.0',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ success: true, database: 'connected', status: 'healthy' });
    } catch (error) {
        res.status(500).json({ success: false, database: 'disconnected', status: 'unhealthy' });
    }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/servicios', serviciosRoutes);
app.use('/api/cargos', cargosRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/historial', historialRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint no encontrado' });
});

// Error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Skynet API corriendo en puerto ${PORT}`);
});

module.exports = app;

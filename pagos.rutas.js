const express = require('express');
const router = express.Router();
const ctrl = require('../controladores/pagos.controlador');

// Catálogo métodos de pago
router.get('/metodos', ctrl.obtenerMetodosPago);
router.post('/metodos', ctrl.crearMetodoPago);

// Estado de cuenta
router.get('/estado-cuenta/:cliente_id', ctrl.obtenerEstadoCuenta);

// Reportes
router.get('/reporte/adeudos', ctrl.reporteAdeudos);

// CRUD Pagos
router.get('/', ctrl.listarPagos);
router.get('/historial/:cliente_id', ctrl.obtenerHistorialPagos);
router.post('/', ctrl.registrarPago);

module.exports = router;

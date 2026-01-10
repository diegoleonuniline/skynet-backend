const express = require('express');
const router = express.Router();
const ctrl = require('../controladores/pagos.controlador');

// Catálogo métodos de pago
router.get('/metodos', ctrl.obtenerMetodosPago);
router.post('/metodos', ctrl.crearMetodoPago);

// CRUD Pagos
router.get('/', ctrl.obtenerPagos);
router.get('/historial/:cliente_id', ctrl.obtenerHistorialPagos);
router.get('/reporte', ctrl.reportePagos);
router.get('/:id', ctrl.obtenerPagoPorId);
router.post('/', ctrl.registrarPago);

module.exports = router;

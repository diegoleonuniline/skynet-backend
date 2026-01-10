const express = require('express');
const router = express.Router();
const {
  // Catálogos
  obtenerMetodosPago,
  crearMetodoPago,
  // CRUD Pagos
  obtenerPagos,
  obtenerPagoPorId,
  registrarPago,
  // Historial
  obtenerHistorialPagos,
  // Reportes
  reportePagos
} = require('../controladores/pagos.controlador');

// Catálogos - Métodos de pago
router.get('/metodos', obtenerMetodosPago);
router.post('/metodos', crearMetodoPago);

// CRUD Pagos
router.get('/', obtenerPagos);
router.get('/:id', obtenerPagoPorId);
router.post('/', registrarPago);

// Historial por cliente
router.get('/historial/:cliente_id', obtenerHistorialPagos);

// Reportes
router.get('/reporte/diario', reportePagos);

module.exports = router;

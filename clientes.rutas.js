const express = require('express');
const router = express.Router();
const ctrl = require('../controladores/clientes.controlador');

// Estadísticas (debe ir antes de /:id)
router.get('/estadisticas', ctrl.obtenerEstadisticas);

// CRUD Clientes
router.get('/', ctrl.obtenerClientes);
router.get('/:id', ctrl.obtenerCliente);
router.get('/:id/historial', ctrl.obtenerHistorialCambios);
router.post('/', ctrl.crearCliente);
router.put('/:id', ctrl.actualizarCliente);
router.delete('/:id', ctrl.cancelarCliente);

module.exports = router;

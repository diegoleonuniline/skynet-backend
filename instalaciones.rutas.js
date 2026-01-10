const express = require('express');
const router = express.Router();
const ctrl = require('../controladores/instalaciones.controlador');

// Calcular cargos (preview antes de guardar)
router.post('/calcular', ctrl.calcularCargos);

// CRUD Instalaciones
router.get('/', ctrl.listarInstalaciones);
router.get('/:cliente_id', ctrl.obtenerInstalacion);
router.post('/', ctrl.registrarInstalacion);

module.exports = router;

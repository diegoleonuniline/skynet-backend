const express = require('express');
const router = express.Router();
const ctrl = require('../controladores/cargos.controlador');

// Catálogo tipos de cargo
router.get('/tipos', ctrl.obtenerTiposCargo);
router.post('/tipos', ctrl.crearTipoCargo);

// CRUD Cargos
router.get('/', ctrl.obtenerCargos);
router.get('/estado-cuenta/:cliente_id', ctrl.obtenerEstadoCuenta);
router.get('/reporte/adeudos', ctrl.reporteAdeudos);
router.get('/:id', ctrl.obtenerCargoPorId);
router.post('/', ctrl.crearCargo);
router.post('/generar-mensuales', ctrl.generarCargosMensuales);

module.exports = router;

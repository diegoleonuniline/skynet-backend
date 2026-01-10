const express = require('express');
const router = express.Router();
const {
  // Catálogos
  obtenerTiposCargo,
  crearTipoCargo,
  // CRUD Cargos
  obtenerCargos,
  obtenerCargoPorId,
  crearCargo,
  actualizarCargo,
  eliminarCargo,
  // Generación automática
  generarCargosMensualesMasivo,
  // Estado de cuenta
  obtenerEstadoCuenta,
  // Reportes
  reporteAdeudos
} = require('../controladores/cargos.controlador');

// Catálogos - Tipos de cargo
router.get('/tipos', obtenerTiposCargo);
router.post('/tipos', crearTipoCargo);

// CRUD Cargos
router.get('/', obtenerCargos);
router.get('/:id', obtenerCargoPorId);
router.post('/', crearCargo);
router.put('/:id', actualizarCargo);
router.delete('/:id', eliminarCargo);

// Generación masiva
router.post('/generar-mensuales', generarCargosMensualesMasivo);

// Estado de cuenta
router.get('/estado-cuenta/:cliente_id', obtenerEstadoCuenta);

// Reportes
router.get('/reporte/adeudos', reporteAdeudos);

module.exports = router;

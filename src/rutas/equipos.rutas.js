const express = require('express');
const router = express.Router();
const { 
  // Catálogos
  obtenerTiposEquipo,
  crearTipoEquipo,
  actualizarTipoEquipo,
  eliminarTipoEquipo,
  obtenerEstadosEquipo,
  crearEstadoEquipo,
  actualizarEstadoEquipo,
  eliminarEstadoEquipo,
  // Equipos
  obtenerEquipos, 
  obtenerEquipoPorId,
  crearEquipo, 
  actualizarEquipo,
  eliminarEquipo 
} = require('../controladores/equipos.controlador');

// Catálogos - Tipos
router.get('/tipos', obtenerTiposEquipo);
router.post('/tipos', crearTipoEquipo);
router.put('/tipos/:id', actualizarTipoEquipo);
router.delete('/tipos/:id', eliminarTipoEquipo);

// Catálogos - Estados
router.get('/estados', obtenerEstadosEquipo);
router.post('/estados', crearEstadoEquipo);
router.put('/estados/:id', actualizarEstadoEquipo);
router.delete('/estados/:id', eliminarEstadoEquipo);

// Equipos
router.get('/', obtenerEquipos);
router.get('/:id', obtenerEquipoPorId);
router.post('/', crearEquipo);
router.put('/:id', actualizarEquipo);
router.delete('/:id', eliminarEquipo);

module.exports = router;

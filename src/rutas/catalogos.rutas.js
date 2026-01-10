const express = require('express');
const router = express.Router();
const {
  obtenerCiudades,
  crearCiudad,
  obtenerColonias,
  crearColonia,
  obtenerPlanes,
  crearPlan,
  obtenerTiposEquipo,
  obtenerEstadosEquipo
} = require('../controladores/catalogos.controlador');

// Ciudades
router.get('/ciudades', obtenerCiudades);
router.post('/ciudades', crearCiudad);

// Colonias
router.get('/colonias', obtenerColonias);
router.post('/colonias', crearColonia);

// Planes
router.get('/planes', obtenerPlanes);
router.post('/planes', crearPlan);

// Tipos de equipo
router.get('/tipos-equipo', obtenerTiposEquipo);

// Estados de equipo
router.get('/estados-equipo', obtenerEstadosEquipo);

module.exports = router;

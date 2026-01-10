const express = require('express');
const router = express.Router();
const {
  obtenerCiudades, crearCiudad,
  obtenerColonias, crearColonia,
  obtenerPlanes, crearPlan
} = require('../controladores/catalogos.controlador');

router.get('/ciudades', obtenerCiudades);
router.post('/ciudades', crearCiudad);
router.get('/colonias', obtenerColonias);
router.post('/colonias', crearColonia);
router.get('/planes', obtenerPlanes);
router.post('/planes', crearPlan);

module.exports = router;

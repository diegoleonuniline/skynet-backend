const express = require('express');
const router = express.Router();
const { obtenerEquipos, crearEquipo } = require('../controladores/equipos.controlador');

router.get('/', obtenerEquipos);
router.post('/', crearEquipo);

module.exports = router;

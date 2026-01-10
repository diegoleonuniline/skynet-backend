const express = require('express');
const router = express.Router();
const {
  obtenerEquipos,
  obtenerTipos,
  obtenerEstados,
  crearEquipo,
  actualizarEquipo,
  eliminarEquipo
} = require('../controladores/equipos.controlador');

router.get('/', obtenerEquipos);
router.get('/tipos', obtenerTipos);
router.get('/estados', obtenerEstados);
router.post('/', crearEquipo);
router.put('/:id', actualizarEquipo);
router.delete('/:id', eliminarEquipo);

module.exports = router;

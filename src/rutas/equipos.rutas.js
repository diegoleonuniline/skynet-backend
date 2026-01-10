const express = require('express');
const router = express.Router();
const { 
  obtenerEquipos, 
  obtenerEquipoPorId,
  crearEquipo, 
  actualizarEquipo,
  eliminarEquipo 
} = require('../controladores/equipos.controlador');

router.get('/', obtenerEquipos);
router.get('/:id', obtenerEquipoPorId);
router.post('/', crearEquipo);
router.put('/:id', actualizarEquipo);
router.delete('/:id', eliminarEquipo);

module.exports = router;

const express = require('express');
const router = express.Router();
const { obtenerCargos, crearCargo } = require('../controladores/cargos.controlador');

router.get('/', obtenerCargos);
router.post('/', crearCargo);

module.exports = router;

const express = require('express');
const router = express.Router();
const { obtenerCargos, obtenerMensualidades, crearCargo } = require('../controladores/cargos.controlador');

router.get('/', obtenerCargos);
router.get('/mensualidades', obtenerMensualidades);
router.post('/', crearCargo);

module.exports = router;

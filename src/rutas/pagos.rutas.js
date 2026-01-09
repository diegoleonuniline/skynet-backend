const express = require('express');
const router = express.Router();
const { obtenerPagos, crearPago } = require('../controladores/pagos.controlador');

router.get('/', obtenerPagos);
router.post('/', crearPago);

module.exports = router;

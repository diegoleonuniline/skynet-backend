const express = require('express');
const router = express.Router();
const {
  obtenerPagosCliente,
  obtenerMensualidadesCliente,
  registrarPago,
  obtenerAdeudo
} = require('../controladores/pagos.controlador');

router.get('/cliente/:cliente_id', obtenerPagosCliente);
router.get('/mensualidades/:cliente_id', obtenerMensualidadesCliente);
router.get('/adeudo/:cliente_id', obtenerAdeudo);
router.post('/', registrarPago);

module.exports = router;

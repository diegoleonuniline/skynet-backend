const express = require('express');
const router = express.Router();
const {
  obtenerMetodosPago,
  obtenerHistorialPagos,
  obtenerPago,
  obtenerPagosCliente,
  obtenerMensualidadesCliente,
  registrarPago,
  cancelarPago,
  editarPago,
  obtenerAdeudo
} = require('../controladores/pagos.controlador');

router.get('/metodos', obtenerMetodosPago);
router.get('/historial/:cliente_id', obtenerHistorialPagos);
router.get('/cliente/:cliente_id', obtenerPagosCliente);
router.get('/mensualidades/:cliente_id', obtenerMensualidadesCliente);
router.get('/adeudo/:cliente_id', obtenerAdeudo);
router.get('/:id', obtenerPago);
router.post('/', registrarPago);
router.put('/:id', editarPago);
router.put('/:id/cancelar', cancelarPago);

module.exports = router;

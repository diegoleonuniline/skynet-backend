const express = require('express');
const router = express.Router();
const pagosController = require('../controllers/pagos.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso, soloAdmin } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('pagos', 'leer'), pagosController.listar);
router.get('/recibo/:id', verificarToken, checkPermiso('pagos', 'leer'), pagosController.recibo);
router.get('/historial/:clienteId', verificarToken, soloAdmin, pagosController.historialCliente);
router.get('/:id', verificarToken, checkPermiso('pagos', 'leer'), pagosController.obtener);
router.post('/', verificarToken, checkPermiso('pagos', 'crear'), pagosController.crear);
router.post('/preview', verificarToken, checkPermiso('pagos', 'crear'), pagosController.preview);
router.post('/:id/cancelar', verificarToken, soloAdmin, pagosController.cancelar);

module.exports = router;

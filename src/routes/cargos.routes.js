const express = require('express');
const router = express.Router();
const cargosController = require('../controllers/cargos.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso, soloAdmin } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('cargos', 'leer'), cargosController.listar);
router.get('/resumen/:clienteId', verificarToken, checkPermiso('cargos', 'leer'), cargosController.resumenCliente);
router.get('/:id', verificarToken, checkPermiso('cargos', 'leer'), cargosController.obtener);
router.post('/', verificarToken, soloAdmin, cargosController.crear);
router.post('/generar-mensualidades', verificarToken, soloAdmin, cargosController.generarMensualidades);
router.post('/:id/cancelar', verificarToken, soloAdmin, cargosController.cancelar);

module.exports = router;

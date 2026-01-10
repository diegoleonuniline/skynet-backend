const express = require('express');
const router = express.Router();
const serviciosController = require('../controllers/servicios.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso, soloAdmin } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('servicios', 'leer'), serviciosController.listar);
router.get('/:id', verificarToken, checkPermiso('servicios', 'leer'), serviciosController.obtener);
router.post('/', verificarToken, checkPermiso('servicios', 'crear'), serviciosController.crear);
router.put('/:id', verificarToken, soloAdmin, serviciosController.actualizar);
router.post('/:id/activar', verificarToken, checkPermiso('servicios', 'editar'), serviciosController.activar);
router.post('/:id/cancelar', verificarToken, soloAdmin, serviciosController.cancelar);

module.exports = router;

const express = require('express');
const router = express.Router();
const instalacionesController = require('../controllers/instalaciones.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso, soloAdmin } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('instalaciones', 'leer'), instalacionesController.listar);
router.get('/:id', verificarToken, checkPermiso('instalaciones', 'leer'), instalacionesController.obtener);
router.post('/', verificarToken, checkPermiso('instalaciones', 'crear'), instalacionesController.crear);
router.post('/:id/completar', verificarToken, checkPermiso('instalaciones', 'editar'), instalacionesController.completar);
router.post('/:id/reprogramar', verificarToken, checkPermiso('instalaciones', 'editar'), instalacionesController.reprogramar);
router.post('/:id/cancelar', verificarToken, soloAdmin, instalacionesController.cancelar);

module.exports = router;

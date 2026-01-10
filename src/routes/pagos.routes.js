const express = require('express');
const router = express.Router();
const controller = require('../controllers/pagos.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('pagos', 'leer'), controller.listar);
router.post('/preview', verificarToken, checkPermiso('pagos', 'crear'), controller.preview);
router.post('/', verificarToken, checkPermiso('pagos', 'crear'), controller.crear);

module.exports = router;

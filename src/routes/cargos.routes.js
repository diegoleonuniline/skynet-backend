const express = require('express');
const router = express.Router();
const controller = require('../controllers/cargos.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('cargos', 'leer'), controller.listar);
router.post('/', verificarToken, checkPermiso('cargos', 'crear'), controller.crear);

module.exports = router;

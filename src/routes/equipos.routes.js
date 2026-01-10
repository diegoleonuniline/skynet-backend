const express = require('express');
const router = express.Router();
const controller = require('../controllers/equipos.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('equipos', 'leer'), controller.listar);
router.post('/', verificarToken, checkPermiso('equipos', 'crear'), controller.crear);

module.exports = router;

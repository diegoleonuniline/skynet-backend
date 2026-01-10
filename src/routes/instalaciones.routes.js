const express = require('express');
const router = express.Router();
const c = require('../controllers/instalaciones.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('instalaciones', 'leer'), c.listar);
router.post('/', verificarToken, checkPermiso('instalaciones', 'crear'), c.crear);

module.exports = router;

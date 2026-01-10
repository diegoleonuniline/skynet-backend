const express = require('express');
const router = express.Router();
const c = require('../controllers/cargos.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('cargos', 'leer'), c.listar);
router.post('/', verificarToken, checkPermiso('cargos', 'crear'), c.crear);

module.exports = router;

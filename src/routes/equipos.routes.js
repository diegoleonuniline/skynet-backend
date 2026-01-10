const express = require('express');
const router = express.Router();
const c = require('../controllers/equipos.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('equipos', 'leer'), c.listar);
router.post('/', verificarToken, checkPermiso('equipos', 'crear'), c.crear);

module.exports = router;

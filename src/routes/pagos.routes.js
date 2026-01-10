const express = require('express');
const router = express.Router();
const c = require('../controllers/pagos.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('pagos', 'leer'), c.listar);
router.post('/preview', verificarToken, checkPermiso('pagos', 'crear'), c.preview);
router.post('/', verificarToken, checkPermiso('pagos', 'crear'), c.crear);

module.exports = router;

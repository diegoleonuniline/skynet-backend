const express = require('express');
const router = express.Router();
const c = require('../controllers/catalogos.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso, soloAdmin } = require('../middlewares/permisos');

router.get('/:catalogo', verificarToken, checkPermiso('catalogos', 'leer'), c.listar);
router.post('/:catalogo', verificarToken, soloAdmin, c.crear);

module.exports = router;

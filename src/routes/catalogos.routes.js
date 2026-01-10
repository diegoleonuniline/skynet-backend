const express = require('express');
const router = express.Router();
const controller = require('../controllers/catalogos.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso, soloAdmin } = require('../middlewares/permisos');

router.get('/:catalogo', verificarToken, checkPermiso('catalogos', 'leer'), controller.listar);
router.post('/:catalogo', verificarToken, soloAdmin, controller.crear);

module.exports = router;

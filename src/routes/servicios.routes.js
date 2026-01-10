const express = require('express');
const router = express.Router();
const controller = require('../controllers/servicios.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('servicios', 'leer'), controller.listar);
router.get('/:id', verificarToken, checkPermiso('servicios', 'leer'), controller.obtener);
router.post('/', verificarToken, checkPermiso('servicios', 'crear'), controller.crear);
router.put('/:id', verificarToken, checkPermiso('servicios', 'editar'), controller.actualizar);

module.exports = router;

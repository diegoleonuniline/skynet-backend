const express = require('express');
const router = express.Router();
const c = require('../controllers/servicios.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('servicios', 'leer'), c.listar);
router.get('/:id', verificarToken, checkPermiso('servicios', 'leer'), c.obtener);
router.post('/', verificarToken, checkPermiso('servicios', 'crear'), c.crear);
router.put('/:id', verificarToken, checkPermiso('servicios', 'editar'), c.actualizar);

module.exports = router;

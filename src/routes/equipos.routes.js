const express = require('express');
const router = express.Router();
const equiposController = require('../controllers/equipos.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso } = require('../middlewares/permisos');

router.get('/', verificarToken, checkPermiso('equipos', 'leer'), equiposController.listar);
router.get('/:id', verificarToken, checkPermiso('equipos', 'leer'), equiposController.obtener);
router.post('/', verificarToken, checkPermiso('equipos', 'crear'), equiposController.crear);
router.put('/:id', verificarToken, checkPermiso('equipos', 'editar'), equiposController.actualizar);
router.delete('/:id', verificarToken, checkPermiso('equipos', 'eliminar'), equiposController.eliminar);

module.exports = router;

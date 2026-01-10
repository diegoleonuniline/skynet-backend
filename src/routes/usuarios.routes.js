const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const { verificarToken } = require('../middlewares/auth');
const { soloAdmin } = require('../middlewares/permisos');

router.get('/', verificarToken, soloAdmin, usuariosController.listar);
router.get('/tecnicos', verificarToken, usuariosController.tecnicos);
router.get('/:id', verificarToken, soloAdmin, usuariosController.obtener);
router.post('/', verificarToken, soloAdmin, usuariosController.crear);
router.put('/:id', verificarToken, soloAdmin, usuariosController.actualizar);
router.post('/:id/reset-password', verificarToken, soloAdmin, usuariosController.resetPassword);
router.delete('/:id', verificarToken, soloAdmin, usuariosController.eliminar);

module.exports = router;

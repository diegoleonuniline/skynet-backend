const express = require('express');
const router = express.Router();
const controller = require('../controllers/usuarios.controller');
const { verificarToken } = require('../middlewares/auth');
const { soloAdmin } = require('../middlewares/permisos');

router.get('/', verificarToken, soloAdmin, controller.listar);
router.post('/', verificarToken, soloAdmin, controller.crear);
router.put('/:id', verificarToken, soloAdmin, controller.actualizar);
router.post('/:id/reset-password', verificarToken, soloAdmin, controller.resetPassword);

module.exports = router;

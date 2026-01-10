const express = require('express');
const router = express.Router();
const c = require('../controllers/usuarios.controller');
const { verificarToken } = require('../middlewares/auth');
const { soloAdmin } = require('../middlewares/permisos');

router.get('/', verificarToken, soloAdmin, c.listar);
router.post('/', verificarToken, soloAdmin, c.crear);
router.put('/:id', verificarToken, soloAdmin, c.actualizar);
router.post('/:id/reset-password', verificarToken, soloAdmin, c.resetPassword);

module.exports = router;

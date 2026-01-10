const express = require('express');
const router = express.Router();
const controller = require('../controllers/reportes.controller');
const { verificarToken } = require('../middlewares/auth');
const { soloAdmin } = require('../middlewares/permisos');

router.get('/dashboard', verificarToken, soloAdmin, controller.dashboard);
router.get('/clientes-adeudo', verificarToken, soloAdmin, controller.clientesAdeudo);

module.exports = router;

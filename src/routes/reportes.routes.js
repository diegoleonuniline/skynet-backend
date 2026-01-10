const express = require('express');
const router = express.Router();
const c = require('../controllers/reportes.controller');
const { verificarToken } = require('../middlewares/auth');
const { soloAdmin } = require('../middlewares/permisos');

router.get('/dashboard', verificarToken, soloAdmin, c.dashboard);
router.get('/clientes-adeudo', verificarToken, soloAdmin, c.clientesAdeudo);

module.exports = router;

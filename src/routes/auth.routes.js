const express = require('express');
const router = express.Router();
const c = require('../controllers/auth.controller');
const { verificarToken } = require('../middlewares/auth');

router.post('/login', c.login);
router.get('/perfil', verificarToken, c.perfil);
router.put('/cambiar-password', verificarToken, c.cambiarPassword);

module.exports = router;

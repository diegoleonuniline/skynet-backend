const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verificarToken } = require('../middlewares/auth');

router.post('/login', authController.login);
router.get('/perfil', verificarToken, authController.perfil);
router.put('/cambiar-password', verificarToken, authController.cambiarPassword);

module.exports = router;

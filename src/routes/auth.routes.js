const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { auth } = require('../middlewares/auth');

router.post('/login', authController.login);
router.post('/logout', auth, authController.logout);
router.get('/me', auth, authController.me);
router.put('/cambiar-password', auth, authController.cambiarPassword);
router.post('/refresh', auth, authController.refreshToken);

module.exports = router;

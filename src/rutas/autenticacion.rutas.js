const express = require('express');
const router = express.Router();
const { login, verificarToken } = require('../controladores/autenticacion.controlador');

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/verificar
router.get('/verificar', verificarToken);

module.exports = router;

const express = require('express');
const router = express.Router();

const { login } = require('../controladores/autenticacion.controlador');

router.post('/login', login);

module.exports = router;

const express = require('express');
const router = express.Router();
const { login } = require('../controladores/auth.controlador');

router.post('/login', login);

module.exports = router;

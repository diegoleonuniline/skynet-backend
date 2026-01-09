const express = require('express');
const router = express.Router();
const { obtenerEstadisticas } = require('../controladores/dashboard.controlador');

router.get('/estadisticas', obtenerEstadisticas);

module.exports = router;

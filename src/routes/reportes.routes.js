const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes.controller');
const { verificarToken } = require('../middlewares/auth');
const { soloAdmin } = require('../middlewares/permisos');

router.get('/dashboard', verificarToken, soloAdmin, reportesController.dashboard);
router.get('/clientes-adeudo', verificarToken, soloAdmin, reportesController.clientesConAdeudo);
router.get('/clientes-estado', verificarToken, soloAdmin, reportesController.clientesEstado);
router.get('/clientes-ubicacion', verificarToken, soloAdmin, reportesController.clientesPorUbicacion);
router.get('/pagos-periodo', verificarToken, soloAdmin, reportesController.pagosPorPeriodo);
router.get('/ingresos-comparativo', verificarToken, soloAdmin, reportesController.ingresosComparativo);

module.exports = router;

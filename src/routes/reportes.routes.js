const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes.controller');
const { auth, hasPermission, isAdmin } = require('../middlewares/auth');

router.use(auth);

router.get('/adeudos', hasPermission('REPORTES', 'LEER'), reportesController.adeudos);
router.get('/clientes-por-ciudad', hasPermission('REPORTES', 'LEER'), reportesController.clientesPorCiudad);
router.get('/clientes-por-zona', hasPermission('REPORTES', 'LEER'), reportesController.clientesPorZona);
router.get('/clientes-por-calle', hasPermission('REPORTES', 'LEER'), reportesController.clientesPorCalle);
router.get('/ingresos', hasPermission('REPORTES', 'LEER'), reportesController.ingresos);
router.get('/cobranza', hasPermission('REPORTES', 'LEER'), reportesController.cobranza);
router.get('/altas-bajas', isAdmin, reportesController.altasBajas);
router.get('/servicios-por-tarifa', hasPermission('REPORTES', 'LEER'), reportesController.serviciosPorTarifa);
router.get('/equipos', hasPermission('REPORTES', 'LEER'), reportesController.equipos);

module.exports = router;

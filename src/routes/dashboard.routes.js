const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { auth } = require('../middlewares/auth');

router.use(auth);

router.get('/resumen', dashboardController.resumen);
router.get('/grafico-ingresos', dashboardController.graficoIngresos);
router.get('/grafico-servicios', dashboardController.graficoServicios);
router.get('/proximos-vencer', dashboardController.proximosVencer);
router.get('/actividad-reciente', dashboardController.actividadReciente);

module.exports = router;

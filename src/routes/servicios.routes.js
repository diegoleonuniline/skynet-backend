const express = require('express');
const router = express.Router();
const serviciosController = require('../controllers/servicios.controller');
const { auth, hasPermission, canAccessZone } = require('../middlewares/auth');

router.use(auth);
router.use(canAccessZone);

router.get('/', hasPermission('SERVICIOS', 'LEER'), serviciosController.getAll);
router.get('/:id', hasPermission('SERVICIOS', 'LEER'), serviciosController.getById);
router.post('/', hasPermission('SERVICIOS', 'CREAR'), serviciosController.create);
router.put('/:id', hasPermission('SERVICIOS', 'EDITAR'), serviciosController.update);
router.delete('/:id', hasPermission('SERVICIOS', 'ELIMINAR'), serviciosController.delete);

// Equipos
router.get('/:id/equipos', hasPermission('SERVICIOS', 'LEER'), serviciosController.getEquipos);
router.post('/:id/equipos', hasPermission('SERVICIOS', 'EDITAR'), serviciosController.addEquipo);
router.put('/:id/equipos/:equipoId', hasPermission('SERVICIOS', 'EDITAR'), serviciosController.updateEquipo);
router.delete('/:id/equipos/:equipoId', hasPermission('SERVICIOS', 'EDITAR'), serviciosController.removeEquipo);

// Cambio de tarifa
router.post('/:id/cambiar-tarifa', hasPermission('SERVICIOS', 'EDITAR'), serviciosController.cambiarTarifa);

// Suspender/Reactivar
router.post('/:id/suspender', hasPermission('SERVICIOS', 'EDITAR'), serviciosController.suspender);
router.post('/:id/reactivar', hasPermission('SERVICIOS', 'EDITAR'), serviciosController.reactivar);
router.post('/:id/cancelar', hasPermission('SERVICIOS', 'EDITAR'), serviciosController.cancelar);

// Historial
router.get('/:id/historial', hasPermission('SERVICIOS', 'LEER'), serviciosController.getHistorial);
router.get('/:id/historial-tarifas', hasPermission('SERVICIOS', 'LEER'), serviciosController.getHistorialTarifas);

module.exports = router;

const express = require('express');
const router = express.Router();
const catalogosController = require('../controllers/catalogos.controller');
const { auth, isAdmin } = require('../middlewares/auth');

router.use(auth);

// Públicos (lectura)
router.get('/roles', catalogosController.getRoles);
router.get('/estados', catalogosController.getEstados);
router.get('/ciudades', catalogosController.getCiudades);
router.get('/ciudades/estado/:estadoId', catalogosController.getCiudadesByEstado);
router.get('/colonias', catalogosController.getColonias);
router.get('/colonias/ciudad/:ciudadId', catalogosController.getColoniasByCiudad);
router.get('/zonas', catalogosController.getZonas);
router.get('/bancos', catalogosController.getBancos);
router.get('/metodos-pago', catalogosController.getMetodosPago);
router.get('/conceptos-cobro', catalogosController.getConceptosCobro);
router.get('/cargos-tipo', catalogosController.getCargosTipo);
router.get('/tarifas', catalogosController.getTarifas);
router.get('/estatus-cliente', catalogosController.getEstatusCliente);
router.get('/estatus-servicio', catalogosController.getEstatusServicio);
router.get('/tipo-equipo', catalogosController.getTipoEquipo);
router.get('/marcas-equipo', catalogosController.getMarcasEquipo);
router.get('/modelos-equipo', catalogosController.getModelosEquipo);
router.get('/modelos-equipo/marca/:marcaId', catalogosController.getModelosByMarca);
router.get('/motivos-cancelacion', catalogosController.getMotivosCancelacion);
router.get('/permisos', catalogosController.getPermisos);

// CRUD genérico (admin)
router.post('/:catalogo', isAdmin, catalogosController.create);
router.put('/:catalogo/:id', isAdmin, catalogosController.update);
router.delete('/:catalogo/:id', isAdmin, catalogosController.delete);

module.exports = router;

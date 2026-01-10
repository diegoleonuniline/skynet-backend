const express = require('express');
const router = express.Router();
const cargosController = require('../controllers/cargos.controller');
const { auth, hasPermission } = require('../middlewares/auth');

router.use(auth);

router.get('/', hasPermission('CARGOS', 'LEER'), cargosController.getAll);
router.get('/pendientes', hasPermission('CARGOS', 'LEER'), cargosController.getPendientes);
router.get('/servicio/:servicioId', hasPermission('CARGOS', 'LEER'), cargosController.getByServicio);
router.get('/:id', hasPermission('CARGOS', 'LEER'), cargosController.getById);
router.post('/', hasPermission('CARGOS', 'CREAR'), cargosController.create);
router.post('/generar-mensualidades', hasPermission('CARGOS', 'CREAR'), cargosController.generarMensualidades);
router.put('/:id', hasPermission('CARGOS', 'EDITAR'), cargosController.update);
router.delete('/:id', hasPermission('CARGOS', 'ELIMINAR'), cargosController.delete);
router.post('/:id/cancelar', hasPermission('CARGOS', 'EDITAR'), cargosController.cancelar);

module.exports = router;

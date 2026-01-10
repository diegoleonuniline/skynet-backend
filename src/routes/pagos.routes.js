const express = require('express');
const router = express.Router();
const pagosController = require('../controllers/pagos.controller');
const { auth, hasPermission } = require('../middlewares/auth');

router.use(auth);

router.get('/', hasPermission('PAGOS', 'LEER'), pagosController.getAll);
router.get('/servicio/:servicioId', hasPermission('PAGOS', 'LEER'), pagosController.getByServicio);
router.get('/:id', hasPermission('PAGOS', 'LEER'), pagosController.getById);
router.post('/', hasPermission('PAGOS', 'CREAR'), pagosController.create);
router.post('/:id/cancelar', hasPermission('PAGOS', 'EDITAR'), pagosController.cancelar);
router.get('/:id/recibo', hasPermission('PAGOS', 'LEER'), pagosController.getRecibo);

module.exports = router;

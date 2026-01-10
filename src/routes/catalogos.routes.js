const express = require('express');
const router = express.Router();
const catalogosController = require('../controllers/catalogos.controller');
const { verificarToken } = require('../middlewares/auth');
const { soloAdmin } = require('../middlewares/permisos');

router.get('/', verificarToken, catalogosController.catalogosDisponibles);
router.get('/ciudades-colonias', verificarToken, catalogosController.ciudadesConColonias);
router.get('/:catalogo', verificarToken, catalogosController.obtenerCatalogo);
router.post('/:catalogo', verificarToken, soloAdmin, catalogosController.agregarItem);
router.put('/:catalogo/:id', verificarToken, soloAdmin, catalogosController.actualizarItem);
router.delete('/:catalogo/:id', verificarToken, soloAdmin, catalogosController.desactivarItem);

module.exports = router;

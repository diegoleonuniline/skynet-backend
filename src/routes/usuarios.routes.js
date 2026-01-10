const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const { auth, isAdmin } = require('../middlewares/auth');

router.use(auth);

router.get('/', isAdmin, usuariosController.getAll);
router.get('/:id', isAdmin, usuariosController.getById);
router.post('/', isAdmin, usuariosController.create);
router.put('/:id', isAdmin, usuariosController.update);
router.delete('/:id', isAdmin, usuariosController.delete);
router.post('/:id/zonas', isAdmin, usuariosController.asignarZonas);
router.put('/:id/reset-password', isAdmin, usuariosController.resetPassword);

module.exports = router;

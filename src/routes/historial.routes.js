const express = require('express');
const router = express.Router();
const historialController = require('../controllers/historial.controller');
const { auth, isAdmin } = require('../middlewares/auth');

router.use(auth);

router.get('/', isAdmin, historialController.getAll);
router.get('/tabla/:tabla', isAdmin, historialController.getByTabla);
router.get('/registro/:tabla/:id', historialController.getByRegistro);
router.get('/usuario/:usuarioId', isAdmin, historialController.getByUsuario);

module.exports = router;

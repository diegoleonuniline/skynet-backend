const express = require('express');
const router = express.Router();
const controller = require('../controllers/clientes.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso, soloAdmin } = require('../middlewares/permisos');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', verificarToken, checkPermiso('clientes', 'leer'), controller.listar);
router.get('/:id', verificarToken, checkPermiso('clientes', 'leer'), controller.obtener);
router.post('/', verificarToken, checkPermiso('clientes', 'crear'), controller.crear);
router.put('/:id', verificarToken, soloAdmin, controller.actualizar);
router.delete('/:id', verificarToken, soloAdmin, controller.eliminar);
router.post('/:id/ine', verificarToken, checkPermiso('clientes', 'crear'), upload.single('ine'), controller.subirINE);
router.get('/:id/historial', verificarToken, soloAdmin, controller.historial);

module.exports = router;

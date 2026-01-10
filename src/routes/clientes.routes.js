const express = require('express');
const router = express.Router();
const clientesController = require('../controllers/clientes.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso, soloAdmin } = require('../middlewares/permisos');
const multer = require('multer');

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

router.get('/', verificarToken, checkPermiso('clientes', 'leer'), clientesController.listar);
router.get('/:id', verificarToken, checkPermiso('clientes', 'leer'), clientesController.obtener);
router.post('/', verificarToken, checkPermiso('clientes', 'crear'), clientesController.crear);
router.put('/:id', verificarToken, soloAdmin, clientesController.actualizar);
router.delete('/:id', verificarToken, soloAdmin, clientesController.eliminar);
router.post('/:id/ine', verificarToken, checkPermiso('clientes', 'crear'), upload.single('ine'), clientesController.subirINE);
router.get('/:id/historial', verificarToken, soloAdmin, clientesController.historial);

module.exports = router;

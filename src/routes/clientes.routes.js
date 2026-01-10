const express = require('express');
const router = express.Router();
const c = require('../controllers/clientes.controller');
const { verificarToken } = require('../middlewares/auth');
const { checkPermiso, soloAdmin } = require('../middlewares/permisos');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', verificarToken, checkPermiso('clientes', 'leer'), c.listar);
router.get('/:id', verificarToken, checkPermiso('clientes', 'leer'), c.obtener);
router.post('/', verificarToken, checkPermiso('clientes', 'crear'), c.crear);
router.put('/:id', verificarToken, soloAdmin, c.actualizar);
router.delete('/:id', verificarToken, soloAdmin, c.eliminar);
router.post('/:id/ine', verificarToken, checkPermiso('clientes', 'crear'), upload.single('ine'), c.subirINE);
router.get('/:id/historial', verificarToken, soloAdmin, c.historial);

module.exports = router;

const express = require('express');
const router = express.Router();
const clientesController = require('../controllers/clientes.controller');
const { auth, hasPermission, canAccessZone } = require('../middlewares/auth');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/ine'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ 
    storage, 
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.pdf'].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes JPG, PNG o PDF'));
        }
    }
});

router.use(auth);
router.use(canAccessZone);

router.get('/', hasPermission('CLIENTES', 'LEER'), clientesController.getAll);
router.get('/buscar', hasPermission('CLIENTES', 'LEER'), clientesController.buscar);
router.get('/:id', hasPermission('CLIENTES', 'LEER'), clientesController.getById);
router.post('/', hasPermission('CLIENTES', 'CREAR'), clientesController.create);
router.put('/:id', hasPermission('CLIENTES', 'EDITAR'), clientesController.update);
router.delete('/:id', hasPermission('CLIENTES', 'ELIMINAR'), clientesController.delete);

// INE
router.post('/:id/ine', hasPermission('CLIENTES', 'EDITAR'), upload.single('ine'), clientesController.uploadINE);
router.get('/:id/ine', hasPermission('CLIENTES', 'LEER'), clientesController.getINE);
router.delete('/:id/ine/:ineId', hasPermission('CLIENTES', 'EDITAR'), clientesController.deleteINE);

// Notas
router.get('/:id/notas', hasPermission('CLIENTES', 'LEER'), clientesController.getNotas);
router.post('/:id/notas', hasPermission('CLIENTES', 'EDITAR'), clientesController.addNota);
router.delete('/:id/notas/:notaId', hasPermission('CLIENTES', 'EDITAR'), clientesController.deleteNota);

// Historial
router.get('/:id/historial', hasPermission('CLIENTES', 'LEER'), clientesController.getHistorial);

// Cancelar/Reactivar
router.post('/:id/cancelar', hasPermission('CLIENTES', 'EDITAR'), clientesController.cancelar);
router.post('/:id/reactivar', hasPermission('CLIENTES', 'EDITAR'), clientesController.reactivar);

module.exports = router;

const express = require('express');
const router = express.Router();
const clientesController = require('../controllers/clientes.controller');
const { auth, hasPermission, canAccessZone } = require('../middlewares/auth');
const multer = require('multer');

// Multer en memoria para Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ 
    storage, 
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes JPG, PNG o PDF'));
        }
    }
});

// Middleware de autenticación
router.use(auth);
router.use(canAccessZone);

// CRUD Clientes
router.get('/', hasPermission('CLIENTES', 'LEER'), clientesController.getAll);
router.get('/buscar', hasPermission('CLIENTES', 'LEER'), clientesController.buscar);
router.get('/:id', hasPermission('CLIENTES', 'LEER'), clientesController.getById);
router.post('/', hasPermission('CLIENTES', 'CREAR'), clientesController.create);
router.put('/:id', hasPermission('CLIENTES', 'EDITAR'), clientesController.update);
router.delete('/:id', hasPermission('CLIENTES', 'ELIMINAR'), clientesController.delete);

// INE (Cloudinary)
router.post('/:id/ine', hasPermission('CLIENTES', 'EDITAR'), upload.single('archivo'), clientesController.uploadINE);
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

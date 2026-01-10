const express = require('express');
const router = express.Router();
const { subirDocumento, eliminarDocumento, obtenerDocumentos } = require('../controladores/documentos.controlador');

router.post('/subir', subirDocumento);
router.post('/eliminar', eliminarDocumento);
router.get('/cliente/:cliente_id', obtenerDocumentos);

module.exports = router;

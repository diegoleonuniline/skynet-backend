const express = require('express');
const router = express.Router();
const {
  obtenerClientes,
  obtenerCliente,
  crearCliente,
  crearClienteConInstalacion,
  actualizarCliente,
  eliminarCliente,
  registrarInstalacion
} = require('../controladores/clientes.controlador');

// CRUD básico
router.get('/', obtenerClientes);
router.get('/:id', obtenerCliente);
router.post('/', crearCliente);
router.put('/:id', actualizarCliente);
router.delete('/:id', eliminarCliente);

// Con instalación
router.post('/con-instalacion', crearClienteConInstalacion);
router.post('/:id/instalacion', registrarInstalacion);

module.exports = router;

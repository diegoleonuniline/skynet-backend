const pool = require('../config/database');

const registrarCambio = async (params) => {
  const {
    tabla,
    registroId,
    campo,
    valorAnterior,
    valorNuevo,
    tipoOperacion,
    usuarioId,
    ip
  } = params;
  
  try {
    await pool.query(
      `INSERT INTO historial_cambios 
       (tabla_afectada, registro_id, campo_modificado, valor_anterior, valor_nuevo, tipo_operacion, usuario_id, ip_usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tabla, registroId, campo, valorAnterior, valorNuevo, tipoOperacion, usuarioId, ip]
    );
  } catch (error) {
    console.error('Error registrando cambio:', error);
  }
};

const registrarCreacion = async (tabla, registroId, usuarioId, ip) => {
  await registrarCambio({
    tabla,
    registroId,
    campo: '*',
    valorAnterior: null,
    valorNuevo: 'Registro creado',
    tipoOperacion: 'INSERT',
    usuarioId,
    ip
  });
};

const registrarEdicion = async (tabla, registroId, cambios, usuarioId, ip) => {
  for (const campo in cambios) {
    if (cambios[campo].anterior !== cambios[campo].nuevo) {
      await registrarCambio({
        tabla,
        registroId,
        campo,
        valorAnterior: String(cambios[campo].anterior),
        valorNuevo: String(cambios[campo].nuevo),
        tipoOperacion: 'UPDATE',
        usuarioId,
        ip
      });
    }
  }
};

const registrarEliminacion = async (tabla, registroId, usuarioId, ip) => {
  await registrarCambio({
    tabla,
    registroId,
    campo: 'activo',
    valorAnterior: '1',
    valorNuevo: '0',
    tipoOperacion: 'DELETE',
    usuarioId,
    ip
  });
};

const obtenerHistorial = async (tabla, registroId) => {
  const [historial] = await pool.query(
    `SELECT h.*, u.nombre_completo as usuario_nombre
     FROM historial_cambios h
     JOIN usuarios u ON h.usuario_id = u.id
     WHERE h.tabla_afectada = ? AND h.registro_id = ?
     ORDER BY h.created_at DESC`,
    [tabla, registroId]
  );
  return historial;
};

module.exports = {
  registrarCambio,
  registrarCreacion,
  registrarEdicion,
  registrarEliminacion,
  obtenerHistorial
};

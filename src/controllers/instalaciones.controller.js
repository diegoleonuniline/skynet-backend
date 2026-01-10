const pool = require('../config/database');
const { registrarCreacion, registrarEdicion } = require('../services/historial.service');
const { generarCargoInstalacion, getCatalogoId } = require('../services/cargos.service');

// Listar instalaciones
const listar = async (req, res) => {
  try {
    const { estado_id, tecnico_id, fecha_desde, fecha_hasta, page = 1, limit = 20 } = req.query;
    
    let query = `
      SELECT i.*, 
             s.precio_mensual,
             c.nombre as cliente_nombre,
             c.apellido_paterno as cliente_apellido,
             c.numero_cliente,
             c.telefono_principal as cliente_telefono,
             c.calle, c.numero_exterior,
             col.nombre as colonia,
             ei.nombre as estado,
             u.nombre_completo as tecnico_nombre
      FROM instalaciones i
      JOIN servicios s ON i.servicio_id = s.id
      JOIN clientes c ON s.cliente_id = c.id
      LEFT JOIN cat_colonias col ON c.colonia_id = col.id
      JOIN cat_estados_instalacion ei ON i.estado_id = ei.id
      LEFT JOIN usuarios u ON i.tecnico_id = u.id
      WHERE i.activo = 1
    `;
    
    const params = [];
    
    if (estado_id) {
      query += ` AND i.estado_id = ?`;
      params.push(estado_id);
    }
    
    if (tecnico_id) {
      query += ` AND i.tecnico_id = ?`;
      params.push(tecnico_id);
    }
    
    if (fecha_desde) {
      query += ` AND i.fecha_programada >= ?`;
      params.push(fecha_desde);
    }
    
    if (fecha_hasta) {
      query += ` AND i.fecha_programada <= ?`;
      params.push(fecha_hasta);
    }
    
    const offset = (page - 1) * limit;
    query += ` ORDER BY i.fecha_programada ASC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [instalaciones] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: instalaciones
    });
    
  } catch (error) {
    console.error('Error listando instalaciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar instalaciones'
    });
  }
};

// Obtener instalación por ID
const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [instalaciones] = await pool.query(
      `SELECT i.*, 
              s.precio_mensual, s.tarifa_id,
              c.id as cliente_id,
              c.nombre as cliente_nombre,
              c.apellido_paterno as cliente_apellido,
              c.numero_cliente,
              c.telefono_principal as cliente_telefono,
              c.calle, c.numero_exterior, c.numero_interior,
              col.nombre as colonia,
              ciu.nombre as ciudad,
              ei.nombre as estado,
              u.nombre_completo as tecnico_nombre
       FROM instalaciones i
       JOIN servicios s ON i.servicio_id = s.id
       JOIN clientes c ON s.cliente_id = c.id
       LEFT JOIN cat_colonias col ON c.colonia_id = col.id
       LEFT JOIN cat_ciudades ciu ON col.ciudad_id = ciu.id
       JOIN cat_estados_instalacion ei ON i.estado_id = ei.id
       LEFT JOIN usuarios u ON i.tecnico_id = u.id
       WHERE i.id = ? AND i.activo = 1`,
      [id]
    );
    
    if (instalaciones.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Instalación no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: instalaciones[0]
    });
    
  } catch (error) {
    console.error('Error obteniendo instalación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener instalación'
    });
  }
};

// Crear instalación
const crear = async (req, res) => {
  try {
    const {
      servicio_id,
      fecha_programada,
      tecnico_id,
      costo_instalacion = 0,
      observaciones
    } = req.body;
    
    if (!servicio_id || !fecha_programada) {
      return res.status(400).json({
        success: false,
        message: 'Servicio y fecha programada son requeridos'
      });
    }
    
    // Verificar servicio existe
    const [servicio] = await pool.query(
      'SELECT id FROM servicios WHERE id = ? AND activo = 1',
      [servicio_id]
    );
    
    if (servicio.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Servicio no encontrado'
      });
    }
    
    // Verificar no existe instalación activa para el servicio
    const [existente] = await pool.query(
      `SELECT id FROM instalaciones 
       WHERE servicio_id = ? AND activo = 1 
       AND estado_id NOT IN (SELECT id FROM cat_estados_instalacion WHERE nombre = 'Cancelada')`,
      [servicio_id]
    );
    
    if (existente.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una instalación para este servicio'
      });
    }
    
    const estadoId = await getCatalogoId('cat_estados_instalacion', 'Programada');
    
    const [result] = await pool.query(
      `INSERT INTO instalaciones 
       (servicio_id, fecha_programada, tecnico_id, costo_instalacion, estado_id, observaciones, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [servicio_id, fecha_programada, tecnico_id, costo_instalacion, estadoId, observaciones, req.userId]
    );
    
    // Generar cargo de instalación si tiene costo
    if (costo_instalacion > 0) {
      await generarCargoInstalacion(servicio_id, costo_instalacion, req.userId);
    }
    
    await registrarCreacion('instalaciones', result.insertId, req.userId, req.ip);
    
    res.status(201).json({
      success: true,
      message: 'Instalación programada correctamente',
      data: {
        id: result.insertId
      }
    });
    
  } catch (error) {
    console.error('Error creando instalación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al programar instalación'
    });
  }
};

// Completar instalación
const completar = async (req, res) => {
  try {
    const { id } = req.params;
    const { hora_inicio, hora_fin, observaciones } = req.body;
    
    // Obtener instalación
    const [instalacion] = await pool.query(
      'SELECT * FROM instalaciones WHERE id = ? AND activo = 1',
      [id]
    );
    
    if (instalacion.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Instalación no encontrada'
      });
    }
    
    const estadoCompletadaId = await getCatalogoId('cat_estados_instalacion', 'Completada');
    const fechaHoy = new Date().toISOString().split('T')[0];
    
    await pool.query(
      `UPDATE instalaciones 
       SET estado_id = ?, fecha_realizada = ?, hora_inicio = ?, hora_fin = ?, 
           observaciones = CONCAT(COALESCE(observaciones, ''), '\n', ?), updated_by = ?
       WHERE id = ?`,
      [estadoCompletadaId, fechaHoy, hora_inicio, hora_fin, observaciones || '', req.userId, id]
    );
    
    // Activar el servicio asociado
    const estadoServicioActivoId = await getCatalogoId('cat_estados_servicio', 'Activo');
    
    await pool.query(
      'UPDATE servicios SET estado_id = ?, updated_by = ? WHERE id = ?',
      [estadoServicioActivoId, req.userId, instalacion[0].servicio_id]
    );
    
    await registrarEdicion('instalaciones', id, {
      estado: { anterior: 'Programada', nuevo: 'Completada' },
      fecha_realizada: { anterior: null, nuevo: fechaHoy }
    }, req.userId, req.ip);
    
    res.json({
      success: true,
      message: 'Instalación completada y servicio activado'
    });
    
  } catch (error) {
    console.error('Error completando instalación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al completar instalación'
    });
  }
};

// Reprogramar instalación
const reprogramar = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha_programada, tecnico_id, observaciones } = req.body;
    
    if (!fecha_programada) {
      return res.status(400).json({
        success: false,
        message: 'Nueva fecha es requerida'
      });
    }
    
    const [actual] = await pool.query(
      'SELECT * FROM instalaciones WHERE id = ? AND activo = 1',
      [id]
    );
    
    if (actual.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Instalación no encontrada'
      });
    }
    
    const estadoReprogramadaId = await getCatalogoId('cat_estados_instalacion', 'Reprogramada');
    
    const updates = ['estado_id = ?', 'fecha_programada = ?', 'updated_by = ?'];
    const values = [estadoReprogramadaId, fecha_programada, req.userId];
    
    if (tecnico_id) {
      updates.push('tecnico_id = ?');
      values.push(tecnico_id);
    }
    
    if (observaciones) {
      updates.push('observaciones = CONCAT(COALESCE(observaciones, \'\'), \'\nReprogramada: \', ?)');
      values.push(observaciones);
    }
    
    values.push(id);
    
    await pool.query(
      `UPDATE instalaciones SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    await registrarEdicion('instalaciones', id, {
      fecha_programada: { anterior: actual[0].fecha_programada, nuevo: fecha_programada }
    }, req.userId, req.ip);
    
    res.json({
      success: true,
      message: 'Instalación reprogramada correctamente'
    });
    
  } catch (error) {
    console.error('Error reprogramando instalación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reprogramar instalación'
    });
  }
};

// Cancelar instalación
const cancelar = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    
    const estadoCanceladaId = await getCatalogoId('cat_estados_instalacion', 'Cancelada');
    
    await pool.query(
      `UPDATE instalaciones 
       SET estado_id = ?, observaciones = CONCAT(COALESCE(observaciones, ''), '\nCancelada: ', ?), updated_by = ?
       WHERE id = ?`,
      [estadoCanceladaId, motivo || 'Sin motivo especificado', req.userId, id]
    );
    
    res.json({
      success: true,
      message: 'Instalación cancelada correctamente'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al cancelar instalación'
    });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  completar,
  reprogramar,
  cancelar
};

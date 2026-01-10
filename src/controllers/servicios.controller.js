const pool = require('../config/database');
const { registrarCreacion, registrarEdicion, registrarEliminacion } = require('../services/historial.service');
const { generarCargoProrrateo, generarCargoMensualidad, getCatalogoId } = require('../services/cargos.service');

// Listar servicios
const listar = async (req, res) => {
  try {
    const { cliente_id, estado_id, page = 1, limit = 20 } = req.query;
    
    let query = `
      SELECT s.*, 
             c.nombre as cliente_nombre,
             c.apellido_paterno as cliente_apellido,
             c.numero_cliente,
             t.nombre as tarifa_nombre,
             t.velocidad_mbps,
             es.nombre as estado
      FROM servicios s
      JOIN clientes c ON s.cliente_id = c.id
      JOIN cat_tarifas t ON s.tarifa_id = t.id
      JOIN cat_estados_servicio es ON s.estado_id = es.id
      WHERE s.activo = 1
    `;
    
    const params = [];
    
    if (cliente_id) {
      query += ` AND s.cliente_id = ?`;
      params.push(cliente_id);
    }
    
    if (estado_id) {
      query += ` AND s.estado_id = ?`;
      params.push(estado_id);
    }
    
    const offset = (page - 1) * limit;
    query += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [servicios] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: servicios
    });
    
  } catch (error) {
    console.error('Error listando servicios:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar servicios'
    });
  }
};

// Obtener servicio por ID
const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [servicios] = await pool.query(
      `SELECT s.*, 
              c.nombre as cliente_nombre,
              c.apellido_paterno as cliente_apellido,
              c.numero_cliente,
              t.nombre as tarifa_nombre,
              t.velocidad_mbps,
              es.nombre as estado
       FROM servicios s
       JOIN clientes c ON s.cliente_id = c.id
       JOIN cat_tarifas t ON s.tarifa_id = t.id
       JOIN cat_estados_servicio es ON s.estado_id = es.id
       WHERE s.id = ? AND s.activo = 1`,
      [id]
    );
    
    if (servicios.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Servicio no encontrado'
      });
    }
    
    // Obtener equipos del servicio
    const [equipos] = await pool.query(
      'SELECT * FROM equipos WHERE servicio_id = ? AND activo = 1',
      [id]
    );
    
    // Obtener instalación
    const [instalacion] = await pool.query(
      `SELECT i.*, ei.nombre as estado, u.nombre_completo as tecnico_nombre
       FROM instalaciones i
       LEFT JOIN cat_estados_instalacion ei ON i.estado_id = ei.id
       LEFT JOIN usuarios u ON i.tecnico_id = u.id
       WHERE i.servicio_id = ? AND i.activo = 1
       ORDER BY i.created_at DESC LIMIT 1`,
      [id]
    );
    
    // Obtener cargos
    const [cargos] = await pool.query(
      `SELECT c.*, tc.nombre as tipo_cargo, ec.nombre as estado
       FROM cargos c
       JOIN cat_tipos_cargo tc ON c.tipo_cargo_id = tc.id
       JOIN cat_estados_cargo ec ON c.estado_id = ec.id
       WHERE c.servicio_id = ? AND c.activo = 1
       ORDER BY c.fecha_vencimiento DESC`,
      [id]
    );
    
    res.json({
      success: true,
      data: {
        ...servicios[0],
        equipos,
        instalacion: instalacion[0] || null,
        cargos
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo servicio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener servicio'
    });
  }
};

// Crear servicio
const crear = async (req, res) => {
  try {
    const {
      cliente_id,
      tarifa_id,
      precio_mensual,
      dia_corte = 10,
      fecha_inicio,
      ip_asignada,
      notas
    } = req.body;
    
    // Validaciones
    if (!cliente_id || !tarifa_id || !precio_mensual || !fecha_inicio) {
      return res.status(400).json({
        success: false,
        message: 'Cliente, tarifa, precio y fecha de inicio son requeridos'
      });
    }
    
    // Verificar cliente existe
    const [cliente] = await pool.query(
      'SELECT id FROM clientes WHERE id = ? AND activo = 1',
      [cliente_id]
    );
    
    if (cliente.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }
    
    // Obtener estado pendiente
    const estadoId = await getCatalogoId('cat_estados_servicio', 'Pendiente');
    
    const [result] = await pool.query(
      `INSERT INTO servicios 
       (cliente_id, tarifa_id, precio_mensual, dia_corte, fecha_inicio, ip_asignada, notas, estado_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cliente_id, tarifa_id, precio_mensual, dia_corte, fecha_inicio, ip_asignada, notas, estadoId, req.userId]
    );
    
    await registrarCreacion('servicios', result.insertId, req.userId, req.ip);
    
    res.status(201).json({
      success: true,
      message: 'Servicio creado correctamente',
      data: {
        id: result.insertId
      }
    });
    
  } catch (error) {
    console.error('Error creando servicio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear servicio'
    });
  }
};

// Activar servicio (después de instalación completada)
const activar = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha_activacion } = req.body;
    
    // Obtener servicio
    const [servicios] = await pool.query(
      'SELECT * FROM servicios WHERE id = ? AND activo = 1',
      [id]
    );
    
    if (servicios.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Servicio no encontrado'
      });
    }
    
    const servicio = servicios[0];
    const fechaAct = fecha_activacion || new Date().toISOString().split('T')[0];
    
    // Cambiar estado a activo
    const estadoActivoId = await getCatalogoId('cat_estados_servicio', 'Activo');
    
    await pool.query(
      'UPDATE servicios SET estado_id = ?, updated_by = ? WHERE id = ?',
      [estadoActivoId, req.userId, id]
    );
    
    // Generar cargo de prorrateo si aplica
    const cargoProrrateoId = await generarCargoProrrateo(
      { ...servicio, id },
      fechaAct,
      req.userId
    );
    
    // Generar primer cargo de mensualidad (para el siguiente mes)
    const fechaActivacion = new Date(fechaAct);
    let mesMensualidad = fechaActivacion.getMonth() + 1;
    let anioMensualidad = fechaActivacion.getFullYear();
    
    // Si se activa antes del día de corte, la primera mensualidad es del mismo mes
    // Si se activa después, es del siguiente mes
    if (fechaActivacion.getDate() >= servicio.dia_corte) {
      mesMensualidad++;
      if (mesMensualidad > 12) {
        mesMensualidad = 1;
        anioMensualidad++;
      }
    }
    
    const cargoMensualidadId = await generarCargoMensualidad(
      { ...servicio, id },
      mesMensualidad,
      anioMensualidad,
      req.userId
    );
    
    res.json({
      success: true,
      message: 'Servicio activado correctamente',
      data: {
        cargo_prorrateo_id: cargoProrrateoId,
        cargo_mensualidad_id: cargoMensualidadId
      }
    });
    
  } catch (error) {
    console.error('Error activando servicio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al activar servicio'
    });
  }
};

// Cancelar servicio (borrado lógico)
const cancelar = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    
    // Solo admin puede cancelar
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para cancelar servicios'
      });
    }
    
    const estadoCanceladoId = await getCatalogoId('cat_estados_servicio', 'Cancelado');
    
    await pool.query(
      `UPDATE servicios 
       SET estado_id = ?, fecha_cancelacion = NOW(), motivo_cancelacion = ?, updated_by = ?
       WHERE id = ?`,
      [estadoCanceladoId, motivo, req.userId, id]
    );
    
    await registrarEliminacion('servicios', id, req.userId, req.ip);
    
    res.json({
      success: true,
      message: 'Servicio cancelado correctamente'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al cancelar servicio'
    });
  }
};

// Actualizar servicio
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    
    // Solo admin puede editar
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para editar servicios'
      });
    }
    
    const [actual] = await pool.query(
      'SELECT * FROM servicios WHERE id = ? AND activo = 1',
      [id]
    );
    
    if (actual.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Servicio no encontrado'
      });
    }
    
    const permitidos = ['tarifa_id', 'precio_mensual', 'dia_corte', 'ip_asignada', 'notas', 'estado_id'];
    const updates = [];
    const values = [];
    const cambios = {};
    
    for (const campo of permitidos) {
      if (campos[campo] !== undefined && campos[campo] !== actual[0][campo]) {
        updates.push(`${campo} = ?`);
        values.push(campos[campo]);
        cambios[campo] = {
          anterior: actual[0][campo],
          nuevo: campos[campo]
        };
      }
    }
    
    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'No hay cambios que guardar'
      });
    }
    
    updates.push('updated_by = ?');
    values.push(req.userId);
    values.push(id);
    
    await pool.query(
      `UPDATE servicios SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    await registrarEdicion('servicios', id, cambios, req.userId, req.ip);
    
    res.json({
      success: true,
      message: 'Servicio actualizado correctamente'
    });
    
  } catch (error) {
    console.error('Error actualizando servicio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar servicio'
    });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  activar,
  cancelar,
  actualizar
};

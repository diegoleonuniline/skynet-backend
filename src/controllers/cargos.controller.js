const pool = require('../config/database');
const { registrarCreacion, registrarEdicion, registrarEliminacion } = require('../services/historial.service');
const { generarCargoMensualidad, actualizarEstadoCargo, getCatalogoId } = require('../services/cargos.service');

// Listar cargos
const listar = async (req, res) => {
  try {
    const { 
      servicio_id, 
      cliente_id, 
      estado_id, 
      tipo_cargo_id,
      fecha_desde,
      fecha_hasta,
      solo_pendientes,
      page = 1, 
      limit = 20 
    } = req.query;
    
    let query = `
      SELECT c.*, 
             tc.nombre as tipo_cargo,
             ec.nombre as estado,
             s.precio_mensual,
             cl.nombre as cliente_nombre,
             cl.apellido_paterno as cliente_apellido,
             cl.numero_cliente
      FROM cargos c
      JOIN cat_tipos_cargo tc ON c.tipo_cargo_id = tc.id
      JOIN cat_estados_cargo ec ON c.estado_id = ec.id
      JOIN servicios s ON c.servicio_id = s.id
      JOIN clientes cl ON s.cliente_id = cl.id
      WHERE c.activo = 1
    `;
    
    const params = [];
    
    if (servicio_id) {
      query += ` AND c.servicio_id = ?`;
      params.push(servicio_id);
    }
    
    if (cliente_id) {
      query += ` AND cl.id = ?`;
      params.push(cliente_id);
    }
    
    if (estado_id) {
      query += ` AND c.estado_id = ?`;
      params.push(estado_id);
    }
    
    if (tipo_cargo_id) {
      query += ` AND c.tipo_cargo_id = ?`;
      params.push(tipo_cargo_id);
    }
    
    if (fecha_desde) {
      query += ` AND c.fecha_vencimiento >= ?`;
      params.push(fecha_desde);
    }
    
    if (fecha_hasta) {
      query += ` AND c.fecha_vencimiento <= ?`;
      params.push(fecha_hasta);
    }
    
    if (solo_pendientes === 'true') {
      query += ` AND c.saldo > 0`;
    }
    
    // Contar total
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;
    
    const offset = (page - 1) * limit;
    query += ` ORDER BY c.fecha_vencimiento DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [cargos] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: cargos,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error listando cargos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar cargos'
    });
  }
};

// Obtener cargo por ID
const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [cargos] = await pool.query(
      `SELECT c.*, 
              tc.nombre as tipo_cargo,
              ec.nombre as estado,
              s.precio_mensual,
              cl.id as cliente_id,
              cl.nombre as cliente_nombre,
              cl.apellido_paterno as cliente_apellido,
              cl.numero_cliente
       FROM cargos c
       JOIN cat_tipos_cargo tc ON c.tipo_cargo_id = tc.id
       JOIN cat_estados_cargo ec ON c.estado_id = ec.id
       JOIN servicios s ON c.servicio_id = s.id
       JOIN clientes cl ON s.cliente_id = cl.id
       WHERE c.id = ? AND c.activo = 1`,
      [id]
    );
    
    if (cargos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cargo no encontrado'
      });
    }
    
    // Obtener pagos aplicados a este cargo
    const [pagosAplicados] = await pool.query(
      `SELECT pd.*, p.numero_recibo, p.fecha_pago
       FROM pago_detalles pd
       JOIN pagos p ON pd.pago_id = p.id
       WHERE pd.cargo_id = ?`,
      [id]
    );
    
    res.json({
      success: true,
      data: {
        ...cargos[0],
        pagos_aplicados: pagosAplicados
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo cargo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener cargo'
    });
  }
};

// Crear cargo manual
const crear = async (req, res) => {
  try {
    const {
      servicio_id,
      tipo_cargo_id,
      concepto,
      monto,
      fecha_vencimiento,
      notas
    } = req.body;
    
    // Solo admin puede crear cargos manuales
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para crear cargos'
      });
    }
    
    if (!servicio_id || !tipo_cargo_id || !concepto || !monto || !fecha_vencimiento) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }
    
    const estadoId = await getCatalogoId('cat_estados_cargo', 'Pendiente');
    const hoy = new Date().toISOString().split('T')[0];
    
    const [result] = await pool.query(
      `INSERT INTO cargos 
       (servicio_id, tipo_cargo_id, concepto, monto, saldo, fecha_emision, fecha_vencimiento, estado_id, notas, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [servicio_id, tipo_cargo_id, concepto, monto, monto, hoy, fecha_vencimiento, estadoId, notas, req.userId]
    );
    
    await registrarCreacion('cargos', result.insertId, req.userId, req.ip);
    
    res.status(201).json({
      success: true,
      message: 'Cargo creado correctamente',
      data: {
        id: result.insertId
      }
    });
    
  } catch (error) {
    console.error('Error creando cargo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear cargo'
    });
  }
};

// Generar mensualidades masivas
const generarMensualidades = async (req, res) => {
  try {
    const { mes, anio } = req.body;
    
    // Solo admin puede generar mensualidades
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para generar mensualidades'
      });
    }
    
    if (!mes || !anio) {
      return res.status(400).json({
        success: false,
        message: 'Mes y año son requeridos'
      });
    }
    
    // Obtener servicios activos
    const [servicios] = await pool.query(
      `SELECT s.* FROM servicios s
       JOIN cat_estados_servicio es ON s.estado_id = es.id
       WHERE es.nombre = 'Activo' AND s.activo = 1`
    );
    
    let generados = 0;
    let existentes = 0;
    
    for (const servicio of servicios) {
      const cargoId = await generarCargoMensualidad(servicio, mes, anio, req.userId);
      if (cargoId) {
        generados++;
      } else {
        existentes++;
      }
    }
    
    res.json({
      success: true,
      message: `Mensualidades generadas: ${generados}, ya existentes: ${existentes}`,
      data: {
        generados,
        existentes,
        total_servicios: servicios.length
      }
    });
    
  } catch (error) {
    console.error('Error generando mensualidades:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar mensualidades'
    });
  }
};

// Cancelar cargo
const cancelar = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    
    // Solo admin puede cancelar
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para cancelar cargos'
      });
    }
    
    const [cargo] = await pool.query(
      'SELECT * FROM cargos WHERE id = ? AND activo = 1',
      [id]
    );
    
    if (cargo.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cargo no encontrado'
      });
    }
    
    if (cargo[0].monto_pagado > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede cancelar un cargo con pagos aplicados'
      });
    }
    
    const estadoCanceladoId = await getCatalogoId('cat_estados_cargo', 'Cancelado');
    
    await pool.query(
      `UPDATE cargos 
       SET estado_id = ?, notas = CONCAT(COALESCE(notas, ''), '\nCancelado: ', ?), updated_by = ?
       WHERE id = ?`,
      [estadoCanceladoId, motivo || 'Sin motivo', req.userId, id]
    );
    
    await registrarEdicion('cargos', id, {
      estado: { anterior: 'Pendiente', nuevo: 'Cancelado' }
    }, req.userId, req.ip);
    
    res.json({
      success: true,
      message: 'Cargo cancelado correctamente'
    });
    
  } catch (error) {
    console.error('Error cancelando cargo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cancelar cargo'
    });
  }
};

// Obtener resumen de cargos por cliente
const resumenCliente = async (req, res) => {
  try {
    const { cliente_id } = req.params;
    
    const [resumen] = await pool.query(
      `SELECT 
         COUNT(*) as total_cargos,
         SUM(CASE WHEN c.saldo > 0 THEN 1 ELSE 0 END) as cargos_pendientes,
         SUM(c.monto) as total_facturado,
         SUM(c.monto_pagado) as total_pagado,
         SUM(c.saldo) as total_adeudo
       FROM cargos c
       JOIN servicios s ON c.servicio_id = s.id
       WHERE s.cliente_id = ? AND c.activo = 1`,
      [cliente_id]
    );
    
    // Obtener cargos vencidos
    const [vencidos] = await pool.query(
      `SELECT COUNT(*) as cantidad, SUM(c.saldo) as monto
       FROM cargos c
       JOIN servicios s ON c.servicio_id = s.id
       WHERE s.cliente_id = ? AND c.saldo > 0 AND c.fecha_vencimiento < CURDATE() AND c.activo = 1`,
      [cliente_id]
    );
    
    res.json({
      success: true,
      data: {
        ...resumen[0],
        cargos_vencidos: vencidos[0].cantidad,
        monto_vencido: vencidos[0].monto || 0
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo resumen:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener resumen'
    });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  generarMensualidades,
  cancelar,
  resumenCliente
};

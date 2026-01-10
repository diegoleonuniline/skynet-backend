const pool = require('../config/database');
const { registrarCreacion, registrarEdicion, obtenerHistorial } = require('../services/historial.service');
const { aplicarPago, obtenerHistorialPagos, obtenerResumenCliente } = require('../services/pagos.service');
const { obtenerCargosPendientes, getCatalogoId } = require('../services/cargos.service');

// Listar pagos
const listar = async (req, res) => {
  try {
    const { 
      cliente_id, 
      fecha_desde, 
      fecha_hasta,
      tipo_pago_id,
      page = 1, 
      limit = 20 
    } = req.query;
    
    // Empleados no pueden ver listado completo de pagos
    if (req.user.rol_nombre === 'Empleado' && !cliente_id) {
      return res.status(403).json({
        success: false,
        message: 'Debes especificar un cliente'
      });
    }
    
    let query = `
      SELECT p.*, 
             tp.nombre as tipo_pago,
             ep.nombre as estado,
             c.nombre as cliente_nombre,
             c.apellido_paterno as cliente_apellido,
             c.numero_cliente,
             u.nombre_completo as registrado_por
      FROM pagos p
      JOIN cat_tipos_pago tp ON p.tipo_pago_id = tp.id
      JOIN cat_estados_pago ep ON p.estado_id = ep.id
      JOIN clientes c ON p.cliente_id = c.id
      JOIN usuarios u ON p.created_by = u.id
      WHERE p.activo = 1
    `;
    
    const params = [];
    
    if (cliente_id) {
      query += ` AND p.cliente_id = ?`;
      params.push(cliente_id);
    }
    
    if (fecha_desde) {
      query += ` AND DATE(p.fecha_pago) >= ?`;
      params.push(fecha_desde);
    }
    
    if (fecha_hasta) {
      query += ` AND DATE(p.fecha_pago) <= ?`;
      params.push(fecha_hasta);
    }
    
    if (tipo_pago_id) {
      query += ` AND p.tipo_pago_id = ?`;
      params.push(tipo_pago_id);
    }
    
    // Contar total
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;
    
    const offset = (page - 1) * limit;
    query += ` ORDER BY p.fecha_pago DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [pagos] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: pagos,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error listando pagos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar pagos'
    });
  }
};

// Obtener pago por ID
const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [pagos] = await pool.query(
      `SELECT p.*, 
              tp.nombre as tipo_pago,
              ep.nombre as estado,
              c.id as cliente_id,
              c.nombre as cliente_nombre,
              c.apellido_paterno as cliente_apellido,
              c.numero_cliente,
              u.nombre_completo as registrado_por
       FROM pagos p
       JOIN cat_tipos_pago tp ON p.tipo_pago_id = tp.id
       JOIN cat_estados_pago ep ON p.estado_id = ep.id
       JOIN clientes c ON p.cliente_id = c.id
       JOIN usuarios u ON p.created_by = u.id
       WHERE p.id = ? AND p.activo = 1`,
      [id]
    );
    
    if (pagos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pago no encontrado'
      });
    }
    
    // Obtener detalles del pago
    const [detalles] = await pool.query(
      `SELECT pd.*, c.concepto, c.monto as cargo_monto
       FROM pago_detalles pd
       JOIN cargos c ON pd.cargo_id = c.id
       WHERE pd.pago_id = ?`,
      [id]
    );
    
    // Verificar saldo a favor generado
    const [saldoFavor] = await pool.query(
      'SELECT * FROM saldos_favor WHERE pago_origen_id = ?',
      [id]
    );
    
    res.json({
      success: true,
      data: {
        ...pagos[0],
        detalles,
        saldo_favor: saldoFavor[0] || null
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo pago:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener pago'
    });
  }
};

// Registrar pago
const crear = async (req, res) => {
  try {
    const {
      cliente_id,
      monto,
      tipo_pago_id,
      referencia,
      notas
    } = req.body;
    
    if (!cliente_id || !monto || !tipo_pago_id) {
      return res.status(400).json({
        success: false,
        message: 'Cliente, monto y tipo de pago son requeridos'
      });
    }
    
    if (monto <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto debe ser mayor a 0'
      });
    }
    
    // Verificar cliente existe
    const [cliente] = await pool.query(
      'SELECT id, nombre, apellido_paterno FROM clientes WHERE id = ? AND activo = 1',
      [cliente_id]
    );
    
    if (cliente.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }
    
    // Aplicar pago
    const resultado = await aplicarPago(
      cliente_id,
      monto,
      tipo_pago_id,
      referencia,
      notas,
      req.userId
    );
    
    if (!resultado.success) {
      return res.status(400).json(resultado);
    }
    
    await registrarCreacion('pagos', resultado.pago_id, req.userId, req.ip);
    
    res.status(201).json({
      success: true,
      message: 'Pago registrado correctamente',
      data: {
        pago_id: resultado.pago_id,
        numero_recibo: resultado.numero_recibo,
        monto_aplicado: resultado.monto_aplicado,
        saldo_favor: resultado.saldo_favor,
        detalles: resultado.detalles,
        cliente: `${cliente[0].nombre} ${cliente[0].apellido_paterno}`
      }
    });
    
  } catch (error) {
    console.error('Error registrando pago:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar pago'
    });
  }
};

// Preview de pago (mostrar cómo se aplicaría)
const preview = async (req, res) => {
  try {
    const { cliente_id, monto } = req.query;
    
    if (!cliente_id || !monto) {
      return res.status(400).json({
        success: false,
        message: 'Cliente y monto son requeridos'
      });
    }
    
    // Obtener cargos pendientes
    const cargosPendientes = await obtenerCargosPendientes(cliente_id);
    
    let montoRestante = parseFloat(monto);
    const aplicacion = [];
    
    for (const cargo of cargosPendientes) {
      if (montoRestante <= 0) break;
      
      const montoAplicar = Math.min(montoRestante, parseFloat(cargo.saldo));
      
      aplicacion.push({
        cargo_id: cargo.id,
        concepto: cargo.concepto,
        fecha_vencimiento: cargo.fecha_vencimiento,
        saldo_actual: cargo.saldo,
        monto_a_aplicar: montoAplicar,
        saldo_restante: parseFloat(cargo.saldo) - montoAplicar
      });
      
      montoRestante -= montoAplicar;
    }
    
    res.json({
      success: true,
      data: {
        monto_total: parseFloat(monto),
        cargos_a_cubrir: aplicacion,
        saldo_favor: montoRestante > 0 ? montoRestante : 0,
        total_adeudo_actual: cargosPendientes.reduce((sum, c) => sum + parseFloat(c.saldo), 0)
      }
    });
    
  } catch (error) {
    console.error('Error en preview:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar preview'
    });
  }
};

// Cancelar pago
const cancelar = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    
    // Solo admin puede cancelar pagos
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para cancelar pagos'
      });
    }
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Obtener pago y detalles
      const [pago] = await connection.query(
        'SELECT * FROM pagos WHERE id = ? AND activo = 1',
        [id]
      );
      
      if (pago.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Pago no encontrado'
        });
      }
      
      // Obtener detalles
      const [detalles] = await connection.query(
        'SELECT * FROM pago_detalles WHERE pago_id = ?',
        [id]
      );
      
      // Revertir cada cargo
      for (const detalle of detalles) {
        await connection.query(
          `UPDATE cargos 
           SET monto_pagado = monto_pagado - ?, saldo = saldo + ?, updated_by = ?
           WHERE id = ?`,
          [detalle.monto_aplicado, detalle.monto_aplicado, req.userId, detalle.cargo_id]
        );
        
        // Actualizar estado del cargo
        const estadoPendienteId = await getCatalogoId('cat_estados_cargo', 'Pendiente');
        await connection.query(
          'UPDATE cargos SET estado_id = ? WHERE id = ? AND saldo > 0',
          [estadoPendienteId, detalle.cargo_id]
        );
      }
      
      // Cancelar saldo a favor si existe
      await connection.query(
        'UPDATE saldos_favor SET activo = 0 WHERE pago_origen_id = ?',
        [id]
      );
      
      // Cancelar el pago
      const estadoCanceladoId = await getCatalogoId('cat_estados_pago', 'Cancelado');
      await connection.query(
        `UPDATE pagos 
         SET estado_id = ?, notas = CONCAT(COALESCE(notas, ''), '\nCANCELADO: ', ?), updated_by = ?
         WHERE id = ?`,
        [estadoCanceladoId, motivo || 'Sin motivo', req.userId, id]
      );
      
      await connection.commit();
      
      await registrarEdicion('pagos', id, {
        estado: { anterior: 'Aplicado', nuevo: 'Cancelado' }
      }, req.userId, req.ip);
      
      res.json({
        success: true,
        message: 'Pago cancelado y cargos revertidos correctamente'
      });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('Error cancelando pago:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cancelar pago'
    });
  }
};

// Historial de pagos del cliente (solo admin)
const historialCliente = async (req, res) => {
  try {
    const { cliente_id } = req.params;
    
    // Solo admin puede ver historial completo
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver el historial de pagos'
      });
    }
    
    const historial = await obtenerHistorialPagos(cliente_id);
    const resumen = await obtenerResumenCliente(cliente_id);
    
    res.json({
      success: true,
      data: {
        resumen,
        pagos: historial
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historial'
    });
  }
};

// Recibo de pago
const recibo = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [pagos] = await pool.query(
      `SELECT p.*, 
              tp.nombre as tipo_pago,
              c.nombre as cliente_nombre,
              c.apellido_paterno as cliente_apellido,
              c.numero_cliente,
              c.telefono_principal,
              c.calle, c.numero_exterior,
              col.nombre as colonia,
              u.nombre_completo as cajero
       FROM pagos p
       JOIN cat_tipos_pago tp ON p.tipo_pago_id = tp.id
       JOIN clientes c ON p.cliente_id = c.id
       LEFT JOIN cat_colonias col ON c.colonia_id = col.id
       JOIN usuarios u ON p.created_by = u.id
       WHERE p.id = ? AND p.activo = 1`,
      [id]
    );
    
    if (pagos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pago no encontrado'
      });
    }
    
    const [detalles] = await pool.query(
      `SELECT pd.*, c.concepto, c.periodo_mes, c.periodo_anio
       FROM pago_detalles pd
       JOIN cargos c ON pd.cargo_id = c.id
       WHERE pd.pago_id = ?`,
      [id]
    );
    
    res.json({
      success: true,
      data: {
        ...pagos[0],
        detalles
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo recibo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener recibo'
    });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  preview,
  cancelar,
  historialCliente,
  recibo
};

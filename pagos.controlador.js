const { obtenerPool } = require('../configuracion/base_datos');
const { actualizarSaldoCliente } = require('./cargos.controlador');

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ========================================
// CATÁLOGO DE MÉTODOS DE PAGO
// ========================================

async function obtenerMetodosPago(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query('SELECT * FROM metodos_pago WHERE activo = 1 ORDER BY nombre');
    res.json({ ok: true, metodos: rows });
  } catch (err) {
    console.error('❌ Error obtenerMetodosPago:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener métodos de pago' });
  }
}

async function crearMetodoPago(req, res) {
  try {
    const { nombre, requiere_referencia } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Nombre requerido' });
    
    const pool = obtenerPool();
    const id = generarUUID();
    await pool.query(
      'INSERT INTO metodos_pago (id, nombre, requiere_referencia) VALUES (?, ?, ?)',
      [id, nombre, requiere_referencia ? 1 : 0]
    );
    res.json({ ok: true, mensaje: 'Método de pago creado', metodo: { id, nombre } });
  } catch (err) {
    console.error('❌ Error crearMetodoPago:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear método de pago' });
  }
}

// ========================================
// OBTENER PAGOS
// ========================================

async function obtenerPagos(req, res) {
  try {
    const { cliente_id, desde, hasta, limite = 50 } = req.query;
    const pool = obtenerPool();
    
    let sql = `
      SELECT p.*, 
             mp.nombre as metodo_nombre,
             c.nombre as cliente_nombre, c.apellido_paterno as cliente_apellido
      FROM pagos p
      LEFT JOIN metodos_pago mp ON mp.id = p.metodo_pago_id
      LEFT JOIN clientes c ON c.id = p.cliente_id
      WHERE 1=1
    `;
    const params = [];
    
    if (cliente_id) {
      sql += ' AND p.cliente_id = ?';
      params.push(cliente_id);
    }
    
    if (desde) {
      sql += ' AND DATE(p.fecha_pago) >= ?';
      params.push(desde);
    }
    
    if (hasta) {
      sql += ' AND DATE(p.fecha_pago) <= ?';
      params.push(hasta);
    }
    
    sql += ' ORDER BY p.fecha_pago DESC LIMIT ?';
    params.push(parseInt(limite));
    
    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, pagos: rows });
  } catch (err) {
    console.error('❌ Error obtenerPagos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener pagos' });
  }
}

async function obtenerPagoPorId(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();
    
    const [pago] = await pool.query(`
      SELECT p.*, mp.nombre as metodo_nombre
      FROM pagos p
      LEFT JOIN metodos_pago mp ON mp.id = p.metodo_pago_id
      WHERE p.id = ?
    `, [id]);
    
    if (!pago.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pago no encontrado' });
    }
    
    // Obtener detalle de aplicación
    const [detalle] = await pool.query(`
      SELECT pd.*, c.concepto as cargo_concepto
      FROM pagos_detalle pd
      LEFT JOIN cargos c ON c.id = pd.cargo_id
      WHERE pd.pago_id = ?
    `, [id]);
    
    res.json({ ok: true, pago: pago[0], detalle });
  } catch (err) {
    console.error('❌ Error obtenerPagoPorId:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener pago' });
  }
}

// ========================================
// REGISTRAR PAGO Y APLICAR AUTOMÁTICAMENTE
// ========================================

async function registrarPago(req, res) {
  const pool = obtenerPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      cliente_id,
      monto,
      metodo_pago_id,
      referencia,
      banco,
      quien_paga,
      telefono_quien_paga,
      comprobante_url,
      observaciones
    } = req.body;
    
    console.log('📥 Registrando pago:', { cliente_id, monto });
    
    if (!cliente_id || !monto || monto <= 0) {
      await connection.rollback();
      return res.status(400).json({ ok: false, mensaje: 'Cliente y monto son requeridos' });
    }
    
    // Obtener cliente
    const [cliente] = await connection.query(
      'SELECT id, saldo_favor FROM clientes WHERE id = ?',
      [cliente_id]
    );
    
    if (cliente.length === 0) {
      await connection.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    }
    
    // 1. CREAR REGISTRO DEL PAGO
    const pagoId = generarUUID();
    await connection.query(`
      INSERT INTO pagos (id, cliente_id, tipo, monto, metodo_pago_id, referencia, banco, quien_paga, telefono_quien_paga, comprobante_url, observaciones)
      VALUES (?, ?, 'otro', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [pagoId, cliente_id, monto, metodo_pago_id || null, referencia || null, banco || null, quien_paga || null, telefono_quien_paga || null, comprobante_url || null, observaciones || null]);
    
    // 2. CALCULAR MONTO TOTAL A APLICAR (pago + saldo a favor)
    const saldoFavorActual = parseFloat(cliente[0].saldo_favor) || 0;
    let montoDisponible = parseFloat(monto) + saldoFavorActual;
    
    console.log('💰 Monto disponible:', montoDisponible, '(pago:', monto, '+ saldo favor:', saldoFavorActual, ')');
    
    // 3. OBTENER CARGOS PENDIENTES (ordenados por fecha de vencimiento)
    const [cargosPendientes] = await connection.query(`
      SELECT id, concepto, monto, monto_pagado, saldo_pendiente
      FROM cargos 
      WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial')
      ORDER BY fecha_vencimiento ASC
    `, [cliente_id]);
    
    console.log('📋 Cargos pendientes:', cargosPendientes.length);
    
    // 4. APLICAR PAGO A CADA CARGO
    const detalleAplicacion = [];
    
    for (const cargo of cargosPendientes) {
      if (montoDisponible <= 0) break;
      
      const saldoCargo = parseFloat(cargo.saldo_pendiente);
      const montoAplicar = Math.min(montoDisponible, saldoCargo);
      
      // Actualizar cargo
      const nuevoMontoPagado = parseFloat(cargo.monto_pagado) + montoAplicar;
      const nuevoEstado = nuevoMontoPagado >= parseFloat(cargo.monto) ? 'pagado' : 'parcial';
      
      await connection.query(
        'UPDATE cargos SET monto_pagado = ?, estado = ? WHERE id = ?',
        [nuevoMontoPagado, nuevoEstado, cargo.id]
      );
      
      // Registrar detalle
      const detalleId = generarUUID();
      await connection.query(
        'INSERT INTO pagos_detalle (id, pago_id, cargo_id, monto_aplicado) VALUES (?, ?, ?, ?)',
        [detalleId, pagoId, cargo.id, montoAplicar]
      );
      
      detalleAplicacion.push({
        cargo_id: cargo.id,
        concepto: cargo.concepto,
        monto_aplicado: montoAplicar,
        estado_nuevo: nuevoEstado
      });
      
      console.log('✅ Aplicado $' + montoAplicar + ' a:', cargo.concepto, '→', nuevoEstado);
      
      montoDisponible -= montoAplicar;
    }
    
    // 5. SI SOBRA DINERO, ACTUALIZAR SALDO A FAVOR
    const nuevoSaldoFavor = montoDisponible > 0 ? Math.round(montoDisponible * 100) / 100 : 0;
    
    // 6. ACTUALIZAR SALDOS DEL CLIENTE
    const [nuevoAdeudo] = await connection.query(
      'SELECT COALESCE(SUM(saldo_pendiente), 0) as total FROM cargos WHERE cliente_id = ? AND estado IN ("pendiente", "parcial")',
      [cliente_id]
    );
    
    await connection.query(
      'UPDATE clientes SET saldo_favor = ?, saldo_pendiente = ? WHERE id = ?',
      [nuevoSaldoFavor, nuevoAdeudo[0].total, cliente_id]
    );
    
    await connection.commit();
    
    console.log('💾 Pago registrado exitosamente. Nuevo saldo favor:', nuevoSaldoFavor);
    
    res.json({
      ok: true,
      mensaje: 'Pago registrado correctamente',
      pago: {
        id: pagoId,
        monto: parseFloat(monto),
        saldo_favor_usado: saldoFavorActual,
        total_aplicado: parseFloat(monto) + saldoFavorActual - nuevoSaldoFavor,
        nuevo_saldo_favor: nuevoSaldoFavor,
        cargos_aplicados: detalleAplicacion.length
      },
      detalle: detalleAplicacion
    });
    
  } catch (err) {
    await connection.rollback();
    console.error('❌ Error registrarPago:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al registrar pago' });
  } finally {
    connection.release();
  }
}

// ========================================
// HISTORIAL DE PAGOS CON DETALLE
// ========================================

async function obtenerHistorialPagos(req, res) {
  try {
    const { cliente_id } = req.params;
    const pool = obtenerPool();
    
    const [pagos] = await pool.query(`
      SELECT 
        p.*,
        mp.nombre as metodo_nombre,
        GROUP_CONCAT(CONCAT(c.concepto, ': $', pd.monto_aplicado) SEPARATOR ' | ') as aplicado_a
      FROM pagos p
      LEFT JOIN metodos_pago mp ON mp.id = p.metodo_pago_id
      LEFT JOIN pagos_detalle pd ON pd.pago_id = p.id
      LEFT JOIN cargos c ON c.id = pd.cargo_id
      WHERE p.cliente_id = ?
      GROUP BY p.id
      ORDER BY p.fecha_pago DESC
      LIMIT 50
    `, [cliente_id]);
    
    res.json({ ok: true, pagos });
  } catch (err) {
    console.error('❌ Error obtenerHistorialPagos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener historial' });
  }
}

// ========================================
// REPORTE DE PAGOS
// ========================================

async function reportePagos(req, res) {
  try {
    const { desde, hasta, metodo_pago_id } = req.query;
    const pool = obtenerPool();
    
    let sql = `
      SELECT 
        p.*,
        mp.nombre as metodo_nombre,
        c.nombre as cliente_nombre, c.apellido_paterno, c.numero_cliente
      FROM pagos p
      LEFT JOIN metodos_pago mp ON mp.id = p.metodo_pago_id
      LEFT JOIN clientes c ON c.id = p.cliente_id
      WHERE 1=1
    `;
    const params = [];
    
    if (desde) {
      sql += ' AND DATE(p.fecha_pago) >= ?';
      params.push(desde);
    }
    
    if (hasta) {
      sql += ' AND DATE(p.fecha_pago) <= ?';
      params.push(hasta);
    }
    
    if (metodo_pago_id) {
      sql += ' AND p.metodo_pago_id = ?';
      params.push(metodo_pago_id);
    }
    
    sql += ' ORDER BY p.fecha_pago DESC';
    
    const [pagos] = await pool.query(sql, params);
    
    // Totales
    const total = pagos.reduce((sum, p) => sum + parseFloat(p.monto), 0);
    
    res.json({ 
      ok: true, 
      pagos,
      resumen: {
        cantidad: pagos.length,
        total: Math.round(total * 100) / 100
      }
    });
  } catch (err) {
    console.error('❌ Error reportePagos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al generar reporte' });
  }
}

module.exports = {
  obtenerMetodosPago,
  crearMetodoPago,
  obtenerPagos,
  obtenerPagoPorId,
  registrarPago,
  obtenerHistorialPagos,
  reportePagos
};

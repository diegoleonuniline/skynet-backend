const { obtenerPool } = require('../configuracion/base_datos');

// ========================================
// CATÁLOGOS - MÉTODOS DE PAGO
// ========================================

async function obtenerMetodosPago(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query('SELECT * FROM metodos_pago WHERE activo = 1 ORDER BY nombre');
    res.json({ ok: true, metodos: rows });
  } catch (err) {
    console.error('❌ Error obtenerMetodosPago:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener métodos' });
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
      [id, nombre, requiere_referencia || 0]
    );
    res.json({ ok: true, mensaje: 'Método creado', metodo: { id, nombre } });
  } catch (err) {
    console.error('❌ Error crearMetodoPago:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear método' });
  }
}

// ========================================
// PAGOS - CRUD
// ========================================

async function obtenerPagos(req, res) {
  try {
    const { cliente_id, desde, hasta, limite } = req.query;
    const pool = obtenerPool();
    
    let query = `
      SELECT p.*, 
             mp.nombre as metodo_nombre,
             c.nombre as cliente_nombre,
             c.apellido_paterno as cliente_apellido,
             c.numero_cliente
      FROM pagos p
      LEFT JOIN metodos_pago mp ON p.metodo_pago_id = mp.id
      LEFT JOIN clientes c ON p.cliente_id = c.id
      WHERE 1=1
    `;
    const params = [];
    
    if (cliente_id) {
      query += ` AND p.cliente_id = ?`;
      params.push(cliente_id);
    }
    
    if (desde) {
      query += ` AND DATE(p.fecha_pago) >= ?`;
      params.push(desde);
    }
    
    if (hasta) {
      query += ` AND DATE(p.fecha_pago) <= ?`;
      params.push(hasta);
    }
    
    query += ` ORDER BY p.fecha_pago DESC`;
    
    if (limite) {
      query += ` LIMIT ?`;
      params.push(parseInt(limite));
    }
    
    const [rows] = await pool.query(query, params);
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
    
    // Pago principal
    const [pago] = await pool.query(`
      SELECT p.*, mp.nombre as metodo_nombre
      FROM pagos p
      LEFT JOIN metodos_pago mp ON p.metodo_pago_id = mp.id
      WHERE p.id = ?
    `, [id]);
    
    if (pago.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Pago no encontrado' });
    }
    
    // Detalle de aplicación
    const [detalle] = await pool.query(`
      SELECT pd.*, c.concepto, c.fecha_vencimiento
      FROM pagos_detalle pd
      JOIN cargos c ON pd.cargo_id = c.id
      WHERE pd.pago_id = ?
    `, [id]);
    
    res.json({ ok: true, pago: pago[0], detalle });
  } catch (err) {
    console.error('❌ Error obtenerPagoPorId:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener pago' });
  }
}

/**
 * REGISTRAR PAGO Y APLICAR A CARGOS
 * 
 * Lógica:
 * 1. Primero usa saldo a favor del cliente (si tiene)
 * 2. Aplica el pago a cargos pendientes (del más antiguo al más nuevo)
 * 3. Si sobra dinero, queda como saldo a favor
 */
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
      observaciones
    } = req.body;
    
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
      INSERT INTO pagos (id, cliente_id, monto, metodo_pago_id, referencia, banco, quien_paga, telefono_quien_paga, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [pagoId, cliente_id, monto, metodo_pago_id, referencia, banco, quien_paga, telefono_quien_paga, observaciones]);
    
    // 2. CALCULAR MONTO TOTAL A APLICAR (pago + saldo a favor)
    const saldoFavorActual = parseFloat(cliente[0].saldo_favor) || 0;
    let montoDisponible = parseFloat(monto) + saldoFavorActual;
    
    // 3. OBTENER CARGOS PENDIENTES (ordenados por fecha de vencimiento)
    const [cargosPendientes] = await connection.query(`
      SELECT id, monto, monto_pagado, saldo_pendiente, concepto
      FROM cargos 
      WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial')
      ORDER BY fecha_vencimiento ASC
    `, [cliente_id]);
    
    // 4. APLICAR PAGO A CADA CARGO
    const detalleAplicacion = [];
    
    for (const cargo of cargosPendientes) {
      if (montoDisponible <= 0) break;
      
      const saldoCargo = parseFloat(cargo.saldo_pendiente);
      const montoAplicar = Math.min(montoDisponible, saldoCargo);
      
      // Actualizar cargo
      const nuevoMontoPagado = parseFloat(cargo.monto_pagado) + montoAplicar;
      const nuevoEstado = nuevoMontoPagado >= parseFloat(cargo.monto) ? 'pagado' : 'parcial';
      
      await connection.query(`
        UPDATE cargos SET monto_pagado = ?, estado = ? WHERE id = ?
      `, [nuevoMontoPagado, nuevoEstado, cargo.id]);
      
      // Registrar detalle
      const detalleId = generarUUID();
      await connection.query(`
        INSERT INTO pagos_detalle (id, pago_id, cargo_id, monto_aplicado)
        VALUES (?, ?, ?, ?)
      `, [detalleId, pagoId, cargo.id, montoAplicar]);
      
      detalleAplicacion.push({
        cargo_id: cargo.id,
        concepto: cargo.concepto,
        monto_aplicado: montoAplicar,
        estado_nuevo: nuevoEstado
      });
      
      montoDisponible -= montoAplicar;
    }
    
    // 5. SI SOBRA DINERO, ACTUALIZAR SALDO A FAVOR
    const nuevoSaldoFavor = montoDisponible > 0 ? montoDisponible : 0;
    await connection.query(
      'UPDATE clientes SET saldo_favor = ? WHERE id = ?',
      [nuevoSaldoFavor, cliente_id]
    );
    
    await connection.commit();
    
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

/**
 * Obtener historial de pagos con detalle de aplicación
 */
async function obtenerHistorialPagos(req, res) {
  try {
    const { cliente_id } = req.params;
    const pool = obtenerPool();
    
    const [pagos] = await pool.query(`
      SELECT 
        p.id, p.monto, p.fecha_pago, p.referencia, p.banco, p.quien_paga,
        mp.nombre as metodo_nombre,
        GROUP_CONCAT(
          CONCAT(c.concepto, ': $', pd.monto_aplicado)
          ORDER BY c.fecha_vencimiento
          SEPARATOR ' | '
        ) as aplicado_a
      FROM pagos p
      LEFT JOIN metodos_pago mp ON p.metodo_pago_id = mp.id
      LEFT JOIN pagos_detalle pd ON p.id = pd.pago_id
      LEFT JOIN cargos c ON pd.cargo_id = c.id
      WHERE p.cliente_id = ?
      GROUP BY p.id
      ORDER BY p.fecha_pago DESC
    `, [cliente_id]);
    
    res.json({ ok: true, pagos });
  } catch (err) {
    console.error('❌ Error obtenerHistorialPagos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener historial' });
  }
}

/**
 * Reporte de pagos del día/periodo
 */
async function reportePagos(req, res) {
  try {
    const { desde, hasta, metodo_pago_id } = req.query;
    const pool = obtenerPool();
    
    const hoy = new Date().toISOString().split('T')[0];
    const fechaDesde = desde || hoy;
    const fechaHasta = hasta || hoy;
    
    let query = `
      SELECT 
        p.*, 
        mp.nombre as metodo_nombre,
        c.nombre as cliente_nombre,
        c.apellido_paterno,
        c.numero_cliente
      FROM pagos p
      LEFT JOIN metodos_pago mp ON p.metodo_pago_id = mp.id
      LEFT JOIN clientes c ON p.cliente_id = c.id
      WHERE DATE(p.fecha_pago) BETWEEN ? AND ?
    `;
    const params = [fechaDesde, fechaHasta];
    
    if (metodo_pago_id) {
      query += ` AND p.metodo_pago_id = ?`;
      params.push(metodo_pago_id);
    }
    
    query += ` ORDER BY p.fecha_pago DESC`;
    
    const [pagos] = await pool.query(query, params);
    
    // Totales
    const [totales] = await pool.query(`
      SELECT 
        COUNT(*) as cantidad,
        SUM(monto) as total
      FROM pagos
      WHERE DATE(fecha_pago) BETWEEN ? AND ?
      ${metodo_pago_id ? 'AND metodo_pago_id = ?' : ''}
    `, metodo_pago_id ? [fechaDesde, fechaHasta, metodo_pago_id] : [fechaDesde, fechaHasta]);
    
    res.json({
      ok: true,
      pagos,
      resumen: {
        cantidad: totales[0].cantidad || 0,
        total: parseFloat(totales[0].total) || 0,
        desde: fechaDesde,
        hasta: fechaHasta
      }
    });
  } catch (err) {
    console.error('❌ Error reportePagos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al generar reporte' });
  }
}

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  // Catálogos
  obtenerMetodosPago,
  crearMetodoPago,
  // CRUD Pagos
  obtenerPagos,
  obtenerPagoPorId,
  registrarPago,
  // Historial
  obtenerHistorialPagos,
  // Reportes
  reportePagos
};

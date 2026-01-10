const { obtenerPool } = require('../configuracion/base_datos');

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
// OBTENER ESTADO DE CUENTA DEL CLIENTE
// ========================================
async function obtenerEstadoCuenta(req, res) {
  try {
    const { cliente_id } = req.params;
    const pool = obtenerPool();

    // Info cliente
    const [cliente] = await pool.query(
      'SELECT id, numero_cliente, nombre, apellido_paterno, saldo_favor, saldo_pendiente, tarifa_mensual, dia_corte FROM clientes WHERE id = ?',
      [cliente_id]
    );

    if (!cliente.length) {
      return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    }

    // Instalación pendiente
    const [instalacion] = await pool.query(
      'SELECT id, monto, monto_pagado, (monto - monto_pagado) as saldo, estado, fecha_instalacion FROM instalaciones WHERE cliente_id = ? AND estado IN ("pendiente", "parcial") ORDER BY creado_en DESC LIMIT 1',
      [cliente_id]
    );

    // Mensualidades pendientes (incluye prorrateo)
    const [mensualidades] = await pool.query(`
      SELECT id, periodo, monto, monto_pagado, (monto - monto_pagado) as saldo, 
             es_prorrateado, dias_prorrateados, fecha_vencimiento, estado
      FROM mensualidades 
      WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial', 'vencido')
      ORDER BY fecha_vencimiento ASC
    `, [cliente_id]);

    // Calcular adeudo total
    let totalAdeudo = 0;
    if (instalacion.length && instalacion[0].estado !== 'pagado') {
      totalAdeudo += parseFloat(instalacion[0].saldo) || 0;
    }
    for (const m of mensualidades) {
      totalAdeudo += parseFloat(m.saldo) || 0;
    }

    res.json({
      ok: true,
      cliente: cliente[0],
      instalacion: instalacion[0] || null,
      mensualidades,
      total_adeudo: Math.round(totalAdeudo * 100) / 100,
      saldo_favor: parseFloat(cliente[0].saldo_favor) || 0
    });
  } catch (err) {
    console.error('❌ Error obtenerEstadoCuenta:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener estado de cuenta' });
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
      numero_recibo,
      tipo_banco,
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
      INSERT INTO pagos (id, cliente_id, tipo, monto, metodo_pago_id, referencia, numero_recibo, tipo_banco, banco, quien_paga, telefono_quien_paga, comprobante_url, observaciones, recibido_por)
      VALUES (?, ?, 'otro', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      pagoId, cliente_id, monto, metodo_pago_id || null, referencia || null,
      numero_recibo || null, tipo_banco || null, banco || null,
      quien_paga || null, telefono_quien_paga || null, comprobante_url || null,
      observaciones || null, req.usuario?.usuario_id || null
    ]);
    
    // 2. CALCULAR MONTO TOTAL A APLICAR (pago + saldo a favor)
    const saldoFavorActual = parseFloat(cliente[0].saldo_favor) || 0;
    let montoDisponible = parseFloat(monto) + saldoFavorActual;
    
    console.log('💰 Monto disponible:', montoDisponible, '(pago:', monto, '+ saldo favor:', saldoFavorActual, ')');
    
    const detalleAplicacion = [];
    
    // 3. PRIMERO: APLICAR A INSTALACIÓN PENDIENTE
    const [instalacionPendiente] = await connection.query(
      'SELECT id, monto, monto_pagado FROM instalaciones WHERE cliente_id = ? AND estado IN ("pendiente", "parcial") ORDER BY creado_en ASC LIMIT 1',
      [cliente_id]
    );
    
    if (instalacionPendiente.length > 0 && montoDisponible > 0) {
      const inst = instalacionPendiente[0];
      const saldoInstalacion = parseFloat(inst.monto) - parseFloat(inst.monto_pagado);
      const montoAplicar = Math.min(montoDisponible, saldoInstalacion);
      
      const nuevoMontoPagado = parseFloat(inst.monto_pagado) + montoAplicar;
      const nuevoEstado = nuevoMontoPagado >= parseFloat(inst.monto) ? 'pagado' : 'parcial';
      
      await connection.query(
        'UPDATE instalaciones SET monto_pagado = ?, estado = ? WHERE id = ?',
        [nuevoMontoPagado, nuevoEstado, inst.id]
      );
      
      // Actualizar pago con referencia a instalación
      await connection.query(
        'UPDATE pagos SET instalacion_id = ?, tipo = "instalacion" WHERE id = ?',
        [inst.id, pagoId]
      );
      
      detalleAplicacion.push({
        tipo: 'instalacion',
        id: inst.id,
        concepto: 'Costo de Instalación',
        monto_aplicado: montoAplicar,
        estado_nuevo: nuevoEstado
      });
      
      console.log('✅ Aplicado $' + montoAplicar + ' a instalación →', nuevoEstado);
      montoDisponible -= montoAplicar;
    }
    
    // 4. SEGUNDO: APLICAR A MENSUALIDADES PENDIENTES (ordenadas por vencimiento)
    if (montoDisponible > 0) {
      const [mensualidadesPendientes] = await connection.query(`
        SELECT id, periodo, monto, monto_pagado, es_prorrateado, dias_prorrateados
        FROM mensualidades 
        WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial', 'vencido')
        ORDER BY fecha_vencimiento ASC
      `, [cliente_id]);
      
      for (const mens of mensualidadesPendientes) {
        if (montoDisponible <= 0) break;
        
        const saldoMensualidad = parseFloat(mens.monto) - parseFloat(mens.monto_pagado);
        const montoAplicar = Math.min(montoDisponible, saldoMensualidad);
        
        const nuevoMontoPagado = parseFloat(mens.monto_pagado) + montoAplicar;
        const nuevoEstado = nuevoMontoPagado >= parseFloat(mens.monto) ? 'pagado' : 'parcial';
        
        await connection.query(
          'UPDATE mensualidades SET monto_pagado = ?, estado = ? WHERE id = ?',
          [nuevoMontoPagado, nuevoEstado, mens.id]
        );
        
        const concepto = mens.es_prorrateado 
          ? `Prorrateo ${mens.dias_prorrateados} días` 
          : `Mensualidad ${mens.periodo}`;
        
        detalleAplicacion.push({
          tipo: mens.es_prorrateado ? 'prorrateo' : 'mensualidad',
          id: mens.id,
          concepto,
          monto_aplicado: montoAplicar,
          estado_nuevo: nuevoEstado
        });
        
        console.log('✅ Aplicado $' + montoAplicar + ' a', concepto, '→', nuevoEstado);
        montoDisponible -= montoAplicar;
      }
    }
    
    // 5. SI SOBRA DINERO → SALDO A FAVOR
    const nuevoSaldoFavor = montoDisponible > 0 ? Math.round(montoDisponible * 100) / 100 : 0;
    
    if (nuevoSaldoFavor > 0) {
      console.log('💚 Saldo a favor:', nuevoSaldoFavor);
    }
    
    // 6. RECALCULAR SALDO PENDIENTE
    const [adeudoInstalacion] = await connection.query(
      'SELECT COALESCE(SUM(monto - monto_pagado), 0) as total FROM instalaciones WHERE cliente_id = ? AND estado IN ("pendiente", "parcial")',
      [cliente_id]
    );
    
    const [adeudoMensualidades] = await connection.query(
      'SELECT COALESCE(SUM(monto - monto_pagado), 0) as total FROM mensualidades WHERE cliente_id = ? AND estado IN ("pendiente", "parcial", "vencido")',
      [cliente_id]
    );
    
    const nuevoSaldoPendiente = parseFloat(adeudoInstalacion[0].total) + parseFloat(adeudoMensualidades[0].total);
    
    // 7. ACTUALIZAR CLIENTE
    await connection.query(
      'UPDATE clientes SET saldo_favor = ?, saldo_pendiente = ? WHERE id = ?',
      [nuevoSaldoFavor, nuevoSaldoPendiente, cliente_id]
    );
    
    await connection.commit();
    
    console.log('💾 Pago registrado. Saldo favor:', nuevoSaldoFavor, '| Saldo pendiente:', nuevoSaldoPendiente);
    
    res.json({
      ok: true,
      mensaje: 'Pago registrado correctamente',
      pago: {
        id: pagoId,
        monto: parseFloat(monto),
        saldo_favor_usado: saldoFavorActual,
        total_aplicado: parseFloat(monto) + saldoFavorActual - nuevoSaldoFavor
      },
      detalle: detalleAplicacion,
      nuevo_saldo_favor: nuevoSaldoFavor,
      nuevo_saldo_pendiente: nuevoSaldoPendiente
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
// HISTORIAL DE PAGOS
// ========================================
async function obtenerHistorialPagos(req, res) {
  try {
    const { cliente_id } = req.params;
    const pool = obtenerPool();
    
    const [pagos] = await pool.query(`
      SELECT 
        p.*,
        mp.nombre as metodo_nombre
      FROM pagos p
      LEFT JOIN metodos_pago mp ON mp.id = p.metodo_pago_id
      WHERE p.cliente_id = ?
      ORDER BY p.fecha_pago DESC
      LIMIT 100
    `, [cliente_id]);
    
    res.json({ ok: true, pagos });
  } catch (err) {
    console.error('❌ Error obtenerHistorialPagos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener historial' });
  }
}

// ========================================
// LISTAR TODOS LOS PAGOS
// ========================================
async function listarPagos(req, res) {
  try {
    const { desde, hasta, metodo_pago_id, limite = 100 } = req.query;
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
    
    sql += ' ORDER BY p.fecha_pago DESC LIMIT ?';
    params.push(parseInt(limite));
    
    const [pagos] = await pool.query(sql, params);
    
    // Total
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
    console.error('❌ Error listarPagos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al listar pagos' });
  }
}

// ========================================
// REPORTE DE ADEUDOS
// ========================================
async function reporteAdeudos(req, res) {
  try {
    const { ciudad_id, colonia_id, vencidos_solo } = req.query;
    const pool = obtenerPool();
    
    let sql = `
      SELECT 
        c.id, c.numero_cliente, c.nombre, c.apellido_paterno, c.telefono,
        c.saldo_pendiente, c.saldo_favor,
        ci.nombre as ciudad_nombre, co.nombre as colonia_nombre,
        (SELECT MIN(fecha_vencimiento) FROM mensualidades WHERE cliente_id = c.id AND estado IN ('pendiente', 'parcial', 'vencido')) as vencimiento_mas_antiguo,
        (SELECT COUNT(*) FROM mensualidades WHERE cliente_id = c.id AND estado = 'vencido') as meses_vencidos
      FROM clientes c
      LEFT JOIN catalogo_ciudades ci ON ci.id = c.ciudad_id
      LEFT JOIN catalogo_colonias co ON co.id = c.colonia_id
      WHERE c.estado = 'activo' AND c.saldo_pendiente > 0
    `;
    const params = [];
    
    if (ciudad_id) {
      sql += ' AND c.ciudad_id = ?';
      params.push(ciudad_id);
    }
    
    if (colonia_id) {
      sql += ' AND c.colonia_id = ?';
      params.push(colonia_id);
    }
    
    sql += ' ORDER BY c.saldo_pendiente DESC';
    
    const [rows] = await pool.query(sql, params);
    
    // Totales
    const totalAdeudo = rows.reduce((sum, r) => sum + parseFloat(r.saldo_pendiente), 0);
    
    res.json({ 
      ok: true, 
      clientes: rows,
      resumen: {
        cantidad: rows.length,
        total_adeudo: Math.round(totalAdeudo * 100) / 100
      }
    });
  } catch (err) {
    console.error('❌ Error reporteAdeudos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al generar reporte' });
  }
}

module.exports = {
  obtenerMetodosPago,
  crearMetodoPago,
  obtenerEstadoCuenta,
  registrarPago,
  obtenerHistorialPagos,
  listarPagos,
  reporteAdeudos
};

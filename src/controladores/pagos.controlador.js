const { obtenerPool } = require('../configuracion/base_datos');

// MÉTODOS DE PAGO
async function obtenerMetodosPago(req, res) {
  res.json({ 
    ok: true, 
    metodos: [
      { id: 'efectivo', nombre: 'Efectivo' },
      { id: 'transferencia', nombre: 'Transferencia' },
      { id: 'tarjeta', nombre: 'Tarjeta' },
      { id: 'deposito', nombre: 'Depósito' },
      { id: 'otro', nombre: 'Otro' }
    ]
  });
}

// HISTORIAL DE PAGOS CON FILTROS
async function obtenerHistorialPagos(req, res) {
  try {
    const { cliente_id } = req.params;
    const { fecha_inicio, fecha_fin, estado } = req.query;
    const pool = obtenerPool();
    
    let query = `
      SELECT p.*, 
        CASE p.metodo_pago
          WHEN 'efectivo' THEN 'Efectivo'
          WHEN 'transferencia' THEN 'Transferencia'
          WHEN 'tarjeta' THEN 'Tarjeta'
          WHEN 'deposito' THEN 'Depósito'
          ELSE 'Otro'
        END as metodo_nombre
      FROM pagos p
      WHERE p.cliente_id = ?
    `;
    const params = [cliente_id];
    
    if (fecha_inicio) {
      query += ' AND DATE(p.fecha_pago) >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      query += ' AND DATE(p.fecha_pago) <= ?';
      params.push(fecha_fin);
    }
    if (estado && estado !== 'todos') {
      query += ' AND p.estado = ?';
      params.push(estado);
    }
    
    query += ' ORDER BY p.fecha_pago DESC';
    
    const [pagos] = await pool.query(query, params);
    
    const totalActivos = pagos.filter(p => p.estado === 'activo' || !p.estado).reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
    const totalCancelados = pagos.filter(p => p.estado === 'cancelado').reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
    
    res.json({ 
      ok: true, 
      pagos,
      resumen: {
        total_activos: totalActivos,
        total_cancelados: totalCancelados,
        cantidad: pagos.length
      }
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener historial' });
  }
}

// OBTENER UN PAGO
async function obtenerPago(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();
    const [pagos] = await pool.query('SELECT * FROM pagos WHERE id = ?', [id]);
    if (!pagos.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pago no encontrado' });
    }
    res.json({ ok: true, pago: pagos[0] });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener pago' });
  }
}

// OBTENER PAGOS DE UN CLIENTE
async function obtenerPagosCliente(req, res) {
  try {
    const { cliente_id } = req.params;
    const pool = obtenerPool();
    const [pagos] = await pool.query(
      `SELECT * FROM pagos WHERE cliente_id = ? ORDER BY fecha_pago DESC`,
      [cliente_id]
    );
    res.json({ ok: true, pagos });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener pagos' });
  }
}

// OBTENER MENSUALIDADES DE UN CLIENTE
async function obtenerMensualidadesCliente(req, res) {
  try {
    const { cliente_id } = req.params;
    const pool = obtenerPool();
    const [mensualidades] = await pool.query(
      `SELECT * FROM mensualidades WHERE cliente_id = ? ORDER BY fecha_vencimiento DESC`,
      [cliente_id]
    );
    res.json({ ok: true, mensualidades });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener mensualidades' });
  }
}

// REGISTRAR PAGO - CORREGIDO
async function registrarPago(req, res) {
  const pool = obtenerPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const {
      cliente_id, monto, metodo_pago_id, referencia,
      banco, quien_paga, telefono_quien_paga, comprobante_url, observaciones,
      usar_saldo_favor
    } = req.body;

    if (!cliente_id || !monto || monto <= 0) {
      connection.release();
      return res.status(400).json({ ok: false, mensaje: 'Cliente y monto válido requeridos' });
    }

    const montoRecibido = parseFloat(monto);
    let montoAplicar = montoRecibido;
    let montoDescontadoSaldo = 0;

    // Usar saldo a favor si se solicita
    if (usar_saldo_favor) {
      const [cliente] = await connection.query('SELECT saldo_favor FROM clientes WHERE id = ?', [cliente_id]);
      const saldoDisponible = parseFloat(cliente[0]?.saldo_favor || 0);
      if (saldoDisponible > 0) {
        montoDescontadoSaldo = saldoDisponible;
        montoAplicar = montoRecibido + montoDescontadoSaldo;
        await connection.query('UPDATE clientes SET saldo_favor = 0 WHERE id = ?', [cliente_id]);
      }
    }

    let montoRestante = montoAplicar;
    let cargosAplicados = 0;
    let totalAplicadoACargos = 0;
    let detalleAplicacion = [];

    // 1. Obtener mensualidades pendientes
    const [mensualidades] = await connection.query(
      `SELECT id, 'mensualidad' as tipo, concepto, monto, COALESCE(monto_pagado, 0) as monto_pagado,
              (monto - COALESCE(monto_pagado, 0)) as pendiente
       FROM mensualidades 
       WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial', 'vencido')
       ORDER BY fecha_vencimiento ASC`,
      [cliente_id]
    );

    // 2. Obtener instalaciones pendientes
    const [instalaciones] = await connection.query(
      `SELECT id, 'instalacion' as tipo, 'Instalación' as concepto, monto, COALESCE(monto_pagado, 0) as monto_pagado,
              (monto - COALESCE(monto_pagado, 0)) as pendiente
       FROM instalaciones 
       WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial')
       ORDER BY fecha_instalacion ASC`,
      [cliente_id]
    );

    const cargosPendientes = [...instalaciones, ...mensualidades];

    // 3. Aplicar pago a cada cargo (FIFO)
    for (const cargo of cargosPendientes) {
      if (montoRestante <= 0) break;

      const pendienteCargo = parseFloat(cargo.pendiente);
      if (pendienteCargo <= 0) continue;

      const aplicar = Math.min(montoRestante, pendienteCargo);
      const nuevoMontoPagado = parseFloat(cargo.monto_pagado) + aplicar;
      const nuevoEstado = nuevoMontoPagado >= parseFloat(cargo.monto) ? 'pagado' : 'parcial';

      if (cargo.tipo === 'mensualidad') {
        await connection.query(
          'UPDATE mensualidades SET monto_pagado = ?, estado = ? WHERE id = ?',
          [nuevoMontoPagado, nuevoEstado, cargo.id]
        );
      } else {
        await connection.query(
          'UPDATE instalaciones SET monto_pagado = ?, estado = ? WHERE id = ?',
          [nuevoMontoPagado, nuevoEstado, cargo.id]
        );
      }

      detalleAplicacion.push(`${cargo.concepto || cargo.tipo}: $${aplicar.toFixed(2)}`);
      montoRestante -= aplicar;
      totalAplicadoACargos += aplicar;
      cargosAplicados++;
    }

    // 4. Si sobra dinero, agregar a saldo a favor
    let nuevoSaldoFavor = 0;
    if (montoRestante > 0) {
      await connection.query(
        'UPDATE clientes SET saldo_favor = saldo_favor + ? WHERE id = ?',
        [montoRestante, cliente_id]
      );
      nuevoSaldoFavor = montoRestante;
      detalleAplicacion.push(`Saldo a favor: $${montoRestante.toFixed(2)}`);
    }

    // 5. Insertar registro del pago (solo monto recibido)
    const [result] = await connection.query(
      `INSERT INTO pagos (
        cliente_id, monto, metodo_pago, referencia, banco,
        quien_paga, telefono_quien_paga, comprobante_url, observaciones,
        aplicado_a, cargos_aplicados, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')`,
      [
        cliente_id, montoRecibido, metodo_pago_id || 'efectivo', referencia || null, banco || null,
        quien_paga || null, telefono_quien_paga || null, comprobante_url || null, observaciones || null,
        detalleAplicacion.join(' | '), cargosAplicados
      ]
    );

    // 6. Actualizar saldo_pendiente del cliente
    await actualizarSaldosCliente(connection, cliente_id);

    await connection.commit();

    res.json({ 
      ok: true, 
      mensaje: 'Pago registrado y aplicado',
      pago: {
        id: result.insertId,
        monto: montoRecibido,
        cargos_aplicados: cargosAplicados,
        total_aplicado: totalAplicadoACargos,
        nuevo_saldo_favor: nuevoSaldoFavor,
        saldo_usado: montoDescontadoSaldo,
        detalle: detalleAplicacion
      }
    });

  } catch (err) {
    await connection.rollback();
    console.error('❌ Error registrarPago:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al registrar pago' });
  } finally {
    connection.release();
  }
}

// CANCELAR PAGO - CORREGIDO (solo agrega monto original a saldo)
async function cancelarPago(req, res) {
  const pool = obtenerPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { motivo } = req.body;

    const [pagos] = await connection.query('SELECT * FROM pagos WHERE id = ?', [id]);
    if (!pagos.length) {
      connection.release();
      return res.status(404).json({ ok: false, mensaje: 'Pago no encontrado' });
    }

    const pago = pagos[0];
    
    if (pago.estado === 'cancelado') {
      connection.release();
      return res.status(400).json({ ok: false, mensaje: 'El pago ya está cancelado' });
    }

    const montoRevertir = parseFloat(pago.monto);
    const clienteId = pago.cliente_id;

    // Solo agregar monto ORIGINAL a saldo a favor
    await connection.query(
      'UPDATE clientes SET saldo_favor = saldo_favor + ? WHERE id = ?',
      [montoRevertir, clienteId]
    );

    // Marcar pago como cancelado
    await connection.query(
      `UPDATE pagos SET 
        estado = 'cancelado', 
        cancelado_en = NOW(),
        motivo_cancelacion = ?
       WHERE id = ?`,
      [motivo || 'Cancelado por usuario', id]
    );

    await connection.commit();

    res.json({ 
      ok: true, 
      mensaje: `Pago cancelado. $${montoRevertir.toFixed(2)} agregado a saldo a favor.`
    });

  } catch (err) {
    await connection.rollback();
    console.error('❌ Error cancelarPago:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al cancelar pago' });
  } finally {
    connection.release();
  }
}

// EDITAR PAGO
async function editarPago(req, res) {
  try {
    const { id } = req.params;
    const { referencia, banco, quien_paga, telefono_quien_paga, observaciones, metodo_pago } = req.body;
    
    const pool = obtenerPool();
    
    await pool.query(
      `UPDATE pagos SET 
        referencia = ?, banco = ?, quien_paga = ?, 
        telefono_quien_paga = ?, observaciones = ?, metodo_pago = ?
       WHERE id = ? AND estado != 'cancelado'`,
      [referencia, banco, quien_paga, telefono_quien_paga, observaciones, metodo_pago, id]
    );

    res.json({ ok: true, mensaje: 'Pago actualizado' });
  } catch (err) {
    console.error('❌ Error editarPago:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al editar pago' });
  }
}

// OBTENER ADEUDO
async function obtenerAdeudo(req, res) {
  try {
    const { cliente_id } = req.params;
    const pool = obtenerPool();

    const [mensualidades] = await pool.query(
      `SELECT * FROM mensualidades 
       WHERE cliente_id = ? AND estado IN ('pendiente', 'vencido', 'parcial')
       ORDER BY fecha_vencimiento ASC`,
      [cliente_id]
    );

    const [instalacion] = await pool.query(
      `SELECT * FROM instalaciones 
       WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial')
       ORDER BY creado_en DESC LIMIT 1`,
      [cliente_id]
    );

    let totalAdeudo = 0;
    mensualidades.forEach(m => {
      totalAdeudo += parseFloat(m.monto) - parseFloat(m.monto_pagado || 0);
    });
    if (instalacion.length) {
      totalAdeudo += parseFloat(instalacion[0].monto) - parseFloat(instalacion[0].monto_pagado || 0);
    }

    res.json({
      ok: true,
      adeudo: {
        mensualidades,
        instalacion: instalacion[0] || null,
        total: totalAdeudo
      }
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener adeudo' });
  }
}

// HELPER: Actualizar saldos del cliente
async function actualizarSaldosCliente(connection, clienteId) {
  const [mensualidades] = await connection.query(
    `SELECT SUM(monto - COALESCE(monto_pagado, 0)) as total 
     FROM mensualidades 
     WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial', 'vencido')`,
    [clienteId]
  );
  
  const [instalaciones] = await connection.query(
    `SELECT SUM(monto - COALESCE(monto_pagado, 0)) as total 
     FROM instalaciones 
     WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial')`,
    [clienteId]
  );

  const totalPendiente = (parseFloat(mensualidades[0]?.total) || 0) + (parseFloat(instalaciones[0]?.total) || 0);

  await connection.query(
    'UPDATE clientes SET saldo_pendiente = ? WHERE id = ?',
    [totalPendiente, clienteId]
  );
}

module.exports = {
  obtenerMetodosPago,
  obtenerHistorialPagos,
  obtenerPago,
  obtenerPagosCliente,
  obtenerMensualidadesCliente,
  registrarPago,
  cancelarPago,
  editarPago,
  obtenerAdeudo
};

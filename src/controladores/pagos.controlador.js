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

// HISTORIAL DE PAGOS
async function obtenerHistorialPagos(req, res) {
  try {
    const { cliente_id } = req.params;
    const pool = obtenerPool();
    const [pagos] = await pool.query(
      `SELECT p.*, 
              CASE p.metodo_pago
                WHEN 'efectivo' THEN 'Efectivo'
                WHEN 'transferencia' THEN 'Transferencia'
                WHEN 'tarjeta' THEN 'Tarjeta'
                WHEN 'deposito' THEN 'Depósito'
                ELSE 'Otro'
              END as metodo_nombre
       FROM pagos p
       WHERE p.cliente_id = ? 
       ORDER BY p.fecha_pago DESC`,
      [cliente_id]
    );
    res.json({ ok: true, pagos });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener historial' });
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

// REGISTRAR PAGO - APLICA AUTOMÁTICAMENTE A CARGOS PENDIENTES
async function registrarPago(req, res) {
  const pool = obtenerPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const {
      cliente_id, monto, metodo_pago_id, referencia,
      banco, quien_paga, telefono_quien_paga, comprobante_url, observaciones
    } = req.body;

    if (!cliente_id || !monto || monto <= 0) {
      connection.release();
      return res.status(400).json({ ok: false, mensaje: 'Cliente y monto válido requeridos' });
    }

    let montoRestante = parseFloat(monto);
    let cargosAplicados = 0;
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

    const cargosPendientes = [...mensualidades, ...instalaciones];

    // 3. Aplicar pago a cada cargo
    for (const cargo of cargosPendientes) {
      if (montoRestante <= 0) break;

      const pendienteCargo = parseFloat(cargo.pendiente);
      if (pendienteCargo <= 0) continue;

      const aplicar = Math.min(montoRestante, pendienteCargo);
      const nuevoMontoPagado = parseFloat(cargo.monto_pagado) + aplicar;
      const nuevoEstado = nuevoMontoPagado >= parseFloat(cargo.monto) ? 'pagado' : 'parcial';

      if (cargo.tipo === 'mensualidad') {
        await connection.query(
          `UPDATE mensualidades SET monto_pagado = ?, estado = ? WHERE id = ?`,
          [nuevoMontoPagado, nuevoEstado, cargo.id]
        );
      } else {
        await connection.query(
          `UPDATE instalaciones SET monto_pagado = ?, estado = ? WHERE id = ?`,
          [nuevoMontoPagado, nuevoEstado, cargo.id]
        );
      }

      detalleAplicacion.push(`${cargo.concepto}: $${aplicar.toFixed(2)}`);
      montoRestante -= aplicar;
      cargosAplicados++;
    }

    // 4. Si sobra dinero, agregar a saldo a favor
    let nuevoSaldoFavor = 0;
    if (montoRestante > 0) {
      const [cliente] = await connection.query(
        `SELECT saldo_favor FROM clientes WHERE id = ?`,
        [cliente_id]
      );
      const saldoActual = parseFloat(cliente[0]?.saldo_favor || 0);
      nuevoSaldoFavor = saldoActual + montoRestante;

      await connection.query(
        `UPDATE clientes SET saldo_favor = ? WHERE id = ?`,
        [nuevoSaldoFavor, cliente_id]
      );
      
      detalleAplicacion.push(`Saldo a favor: $${montoRestante.toFixed(2)}`);
    }

    // 5. Insertar registro del pago
    const [result] = await connection.query(
      `INSERT INTO pagos (
        cliente_id, monto, metodo_pago, referencia, banco,
        quien_paga, telefono_quien_paga, comprobante_url, observaciones,
        aplicado_a, cargos_aplicados
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente_id, monto, metodo_pago_id || 'efectivo', referencia || null, banco || null,
        quien_paga || null, telefono_quien_paga || null, comprobante_url || null, observaciones || null,
        detalleAplicacion.join(' | '), cargosAplicados
      ]
    );

    await connection.commit();

    res.json({ 
      ok: true, 
      mensaje: 'Pago registrado y aplicado',
      pago: {
        id: result.insertId,
        monto: parseFloat(monto),
        cargos_aplicados: cargosAplicados,
        nuevo_saldo_favor: nuevoSaldoFavor,
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

// OBTENER ADEUDO DE CLIENTE
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

module.exports = {
  obtenerMetodosPago,
  obtenerHistorialPagos,
  obtenerPagosCliente,
  obtenerMensualidadesCliente,
  registrarPago,
  obtenerAdeudo
};

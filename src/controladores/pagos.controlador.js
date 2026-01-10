const { obtenerPool } = require('../configuracion/base_datos');

// MÉTODOS DE PAGO (hardcoded)
async function obtenerMetodosPago(req, res) {
  res.json({ 
    ok: true, 
    metodos: [
      { id: 'efectivo', nombre: 'Efectivo' },
      { id: 'transferencia', nombre: 'Transferencia' },
      { id: 'tarjeta', nombre: 'Tarjeta' },
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
              m.concepto as mensualidad_concepto,
              m.periodo as mensualidad_periodo
       FROM pagos p
       LEFT JOIN mensualidades m ON m.id = p.mensualidad_id
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

// REGISTRAR PAGO
async function registrarPago(req, res) {
  const pool = obtenerPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const {
      cliente_id, monto, metodo_pago, referencia, notas,
      mensualidad_id, instalacion_id,
      numero_recibo, tipo_banco, banco, quien_paga, telefono_quien_paga, comprobante_url, observaciones
    } = req.body;

    if (!cliente_id || !monto) {
      return res.status(400).json({ ok: false, mensaje: 'Cliente y monto requeridos' });
    }

    // Determinar tipo de pago
    let tipo = 'otro';
    if (mensualidad_id) tipo = 'mensualidad';
    else if (instalacion_id) tipo = 'instalacion';

    // Insertar pago
    await connection.query(
      `INSERT INTO pagos (
        cliente_id, tipo, monto, metodo_pago, referencia, notas,
        mensualidad_id, instalacion_id,
        numero_recibo, tipo_banco, banco, quien_paga, telefono_quien_paga, comprobante_url, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente_id, tipo, monto, metodo_pago || 'efectivo', referencia || null, notas || null,
        mensualidad_id || null, instalacion_id || null,
        numero_recibo || null, tipo_banco || null, banco || null, 
        quien_paga || null, telefono_quien_paga || null, comprobante_url || null, observaciones || null
      ]
    );

    // Obtener ID del pago
    const [newPago] = await connection.query('SELECT id FROM pagos WHERE cliente_id = ? ORDER BY creado_en DESC LIMIT 1', [cliente_id]);
    const pagoId = newPago[0].id;

    // Actualizar mensualidad si aplica
    if (mensualidad_id) {
      const [mens] = await connection.query('SELECT * FROM mensualidades WHERE id = ?', [mensualidad_id]);
      if (mens.length) {
        const nuevoMontoPagado = parseFloat(mens[0].monto_pagado || 0) + parseFloat(monto);
        const nuevoEstado = nuevoMontoPagado >= parseFloat(mens[0].monto) ? 'pagado' : 'parcial';
        
        await connection.query(
          'UPDATE mensualidades SET monto_pagado = ?, estado = ? WHERE id = ?',
          [nuevoMontoPagado, nuevoEstado, mensualidad_id]
        );
      }
    }

    // Actualizar instalación si aplica
    if (instalacion_id) {
      const [inst] = await connection.query('SELECT * FROM instalaciones WHERE id = ?', [instalacion_id]);
      if (inst.length) {
        const nuevoMontoPagado = parseFloat(inst[0].monto_pagado || 0) + parseFloat(monto);
        const nuevoEstado = nuevoMontoPagado >= parseFloat(inst[0].monto) ? 'pagado' : 'parcial';
        
        await connection.query(
          'UPDATE instalaciones SET monto_pagado = ?, estado = ? WHERE id = ?',
          [nuevoMontoPagado, nuevoEstado, instalacion_id]
        );
      }
    }

    await connection.commit();

    res.json({ ok: true, mensaje: 'Pago registrado', pago: { id: pagoId } });
  } catch (err) {
    await connection.rollback();
    console.error('❌ Error:', err.message);
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

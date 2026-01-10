const { obtenerPool } = require('../configuracion/base_datos');

// ========================================
// OBTENER PAGOS DE UN CLIENTE
// ========================================
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

// ========================================
// OBTENER MENSUALIDADES DE UN CLIENTE
// ========================================
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

// ========================================
// REGISTRAR PAGO
// ========================================
async function registrarPago(req, res) {
  const pool = obtenerPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const {
      cliente_id,
      monto,
      metodo_pago,
      referencia,
      notas,
      mensualidad_id,
      instalacion_id
    } = req.body;

    if (!cliente_id || !monto) {
      return res.status(400).json({ ok: false, mensaje: 'Cliente y monto requeridos' });
    }

    const pagoId = generarUUID();

    // Insertar pago
    await connection.query(
      `INSERT INTO pagos (id, cliente_id, tipo, monto, metodo_pago, referencia, notas, mensualidad_id, instalacion_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pagoId, cliente_id, mensualidad_id ? 'mensualidad' : (instalacion_id ? 'instalacion' : 'otro'),
       monto, metodo_pago || 'efectivo', referencia || null, notas || null,
       mensualidad_id || null, instalacion_id || null]
    );

    // Si es pago de mensualidad
    if (mensualidad_id) {
      const [mens] = await connection.query('SELECT * FROM mensualidades WHERE id = ?', [mensualidad_id]);
      if (mens.length) {
        const nuevoMontoPagado = parseFloat(mens[0].monto_pagado) + parseFloat(monto);
        const nuevoEstado = nuevoMontoPagado >= parseFloat(mens[0].monto) ? 'pagado' : 'parcial';
        
        await connection.query(
          'UPDATE mensualidades SET monto_pagado = ?, estado = ? WHERE id = ?',
          [nuevoMontoPagado, nuevoEstado, mensualidad_id]
        );
      }
    }

    // Si es pago de instalación
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

// ========================================
// OBTENER ADEUDO DE CLIENTE
// ========================================
async function obtenerAdeudo(req, res) {
  try {
    const { cliente_id } = req.params;
    const pool = obtenerPool();

    // Mensualidades pendientes
    const [mensualidades] = await pool.query(
      `SELECT * FROM mensualidades 
       WHERE cliente_id = ? AND estado IN ('pendiente', 'vencido', 'parcial')
       ORDER BY fecha_vencimiento ASC`,
      [cliente_id]
    );

    // Instalación pendiente
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

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  obtenerPagosCliente,
  obtenerMensualidadesCliente,
  registrarPago,
  obtenerAdeudo
};

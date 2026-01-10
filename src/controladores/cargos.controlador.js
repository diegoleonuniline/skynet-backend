const { obtenerPool } = require('../configuracion/base_datos');

// Actualizar estados vencidos automáticamente
async function actualizarEstadosVencidos(pool, clienteId) {
  await pool.query(
    `UPDATE mensualidades 
     SET estado = 'vencido' 
     WHERE cliente_id = ? 
       AND estado = 'pendiente' 
       AND fecha_vencimiento < CURDATE()`,
    [clienteId]
  );
}

// Obtener TODOS los cargos (mensualidades + instalaciones)
async function obtenerCargos(req, res) {
  try {
    const { cliente_id, solo_pendientes } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ ok: false, mensaje: 'cliente_id requerido' });
    }

    const pool = obtenerPool();
    
    // Actualizar vencidos primero
    await actualizarEstadosVencidos(pool, cliente_id);

    let estadosFiltro = solo_pendientes === '1' 
      ? "('pendiente', 'vencido', 'parcial')" 
      : "('pendiente', 'vencido', 'parcial', 'pagado')";

    // Mensualidades
    const [mensualidades] = await pool.query(
      `SELECT id, 'mensualidad' as tipo, concepto, descripcion, monto, 
              COALESCE(monto_pagado, 0) as monto_pagado, 
              (monto - COALESCE(monto_pagado, 0)) as pendiente,
              fecha_vencimiento, estado, periodo, es_prorrateado,
              CASE 
                WHEN estado = 'pagado' THEN 'pagado'
                WHEN fecha_vencimiento < CURDATE() THEN 'vencido'
                ELSE estado 
              END as estado_real
       FROM mensualidades 
       WHERE cliente_id = ? AND estado IN ${estadosFiltro}
       ORDER BY fecha_vencimiento ASC`,
      [cliente_id]
    );

    // Instalaciones
    const [instalaciones] = await pool.query(
      `SELECT id, 'instalacion' as tipo, 'Costo de Instalación' as concepto, 
              notas as descripcion, monto, COALESCE(monto_pagado, 0) as monto_pagado, 
              (monto - COALESCE(monto_pagado, 0)) as pendiente,
              fecha_instalacion as fecha_vencimiento, estado,
              estado as estado_real
       FROM instalaciones 
       WHERE cliente_id = ? AND estado IN ${estadosFiltro}`,
      [cliente_id]
    );

    const cargos = [...instalaciones, ...mensualidades];
    
    let totalMonto = 0;
    let totalPagado = 0;
    let totalPendiente = 0;

    cargos.forEach(c => {
      totalMonto += parseFloat(c.monto);
      totalPagado += parseFloat(c.monto_pagado || 0);
      totalPendiente += parseFloat(c.pendiente || 0);
    });

    res.json({ 
      ok: true, 
      cargos,
      resumen: {
        total_monto: totalMonto,
        total_pagado: totalPagado,
        total_pendiente: totalPendiente
      }
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener cargos' });
  }
}

// Obtener solo mensualidades
async function obtenerMensualidades(req, res) {
  try {
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ ok: false, mensaje: 'cliente_id requerido' });
    }

    const pool = obtenerPool();
    await actualizarEstadosVencidos(pool, cliente_id);

    const [mensualidades] = await pool.query(
      `SELECT *, 
              (monto - COALESCE(monto_pagado, 0)) as pendiente,
              CASE 
                WHEN estado = 'pagado' THEN 'pagado'
                WHEN fecha_vencimiento < CURDATE() AND estado != 'pagado' THEN 'vencido'
                ELSE estado 
              END as estado_real
       FROM mensualidades 
       WHERE cliente_id = ?
       ORDER BY fecha_vencimiento DESC`,
      [cliente_id]
    );

    res.json({ ok: true, mensualidades });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener mensualidades' });
  }
}

// Crear cargo manual
async function crearCargo(req, res) {
  try {
    const { cliente_id, concepto, descripcion, monto, fecha_vencimiento } = req.body;
    
    if (!cliente_id || !monto) {
      return res.status(400).json({ ok: false, mensaje: 'cliente_id y monto requeridos' });
    }

    const pool = obtenerPool();
    const fecha = new Date(fecha_vencimiento || Date.now());
    const periodo = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    
    await pool.query(
      `INSERT INTO mensualidades (
        cliente_id, periodo, fecha_inicio, fecha_fin, fecha_vencimiento,
        monto, estado, concepto, descripcion, es_prorrateado
      ) VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, 0)`,
      [
        cliente_id, periodo, fecha_vencimiento, fecha_vencimiento, fecha_vencimiento,
        monto, concepto || 'Cargo adicional', descripcion || null
      ]
    );

    // Actualizar saldo pendiente
    const [total] = await pool.query(
      `SELECT SUM(monto - COALESCE(monto_pagado, 0)) as pendiente 
       FROM mensualidades 
       WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial', 'vencido')`,
      [cliente_id]
    );
    
    await pool.query(
      'UPDATE clientes SET saldo_pendiente = ? WHERE id = ?',
      [total[0]?.pendiente || 0, cliente_id]
    );

    res.json({ ok: true, mensaje: 'Cargo creado' });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear cargo' });
  }
}

module.exports = {
  obtenerCargos,
  obtenerMensualidades,
  crearCargo
};

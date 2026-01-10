const { obtenerPool } = require('../configuracion/base_datos');

// Obtener cargos de un cliente (mensualidades + instalaciones pendientes)
async function obtenerCargos(req, res) {
  try {
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ ok: false, mensaje: 'cliente_id requerido' });
    }

    const pool = obtenerPool();

    // Mensualidades pendientes
    const [mensualidades] = await pool.query(
      `SELECT id, 'mensualidad' as tipo, concepto, descripcion, monto, monto_pagado, 
              (monto - COALESCE(monto_pagado, 0)) as pendiente,
              fecha_vencimiento, estado, periodo, es_prorrateado
       FROM mensualidades 
       WHERE cliente_id = ? AND estado IN ('pendiente', 'vencido', 'parcial')
       ORDER BY fecha_vencimiento ASC`,
      [cliente_id]
    );

    // Instalación pendiente
    const [instalaciones] = await pool.query(
      `SELECT id, 'instalacion' as tipo, 'Costo de Instalación' as concepto, 
              notas as descripcion, monto, monto_pagado, 
              (monto - COALESCE(monto_pagado, 0)) as pendiente,
              fecha_instalacion as fecha_vencimiento, estado
       FROM instalaciones 
       WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial')`,
      [cliente_id]
    );

    // Combinar y calcular total
    const cargos = [...instalaciones, ...mensualidades];
    let totalPendiente = 0;
    
    cargos.forEach(c => {
      totalPendiente += parseFloat(c.monto) - parseFloat(c.monto_pagado || 0);
    });

    res.json({ 
      ok: true, 
      cargos,
      total_pendiente: totalPendiente
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener cargos' });
  }
}

// Crear cargo manual (mensualidad adicional)
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

    res.json({ ok: true, mensaje: 'Cargo creado' });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear cargo' });
  }
}

module.exports = {
  obtenerCargos,
  crearCargo
};

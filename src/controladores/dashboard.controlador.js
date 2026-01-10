const { obtenerPool } = require('../configuracion/base_datos');

async function obtenerEstadisticas(req, res) {
  try {
    const pool = obtenerPool();

    const [clientesEstado] = await pool.query(`
      SELECT estado, COUNT(*) as total FROM clientes GROUP BY estado
    `);

    const [ingresosMes] = await pool.query(`
      SELECT COALESCE(SUM(monto), 0) as total 
      FROM pagos 
      WHERE MONTH(fecha_pago) = MONTH(CURRENT_DATE()) 
      AND YEAR(fecha_pago) = YEAR(CURRENT_DATE())
    `);

    const [pendientes] = await pool.query(`
      SELECT COUNT(*) as total, COALESCE(SUM(monto - monto_pagado), 0) as monto
      FROM mensualidades WHERE estado IN ('pendiente', 'vencido')
    `);

    const [instalacionesPend] = await pool.query(`
      SELECT COUNT(*) as total FROM instalaciones WHERE estado = 'pendiente'
    `);

    res.json({
      ok: true,
      estadisticas: {
        clientes: {
          activos: clientesEstado.find(c => c.estado === 'activo')?.total || 0,
          suspendidos: clientesEstado.find(c => c.estado === 'suspendido')?.total || 0,
          cancelados: clientesEstado.find(c => c.estado === 'cancelado')?.total || 0
        },
        ingresosMes: ingresosMes[0]?.total || 0,
        mensualidadesPendientes: pendientes[0]?.total || 0,
        montoPendiente: pendientes[0]?.monto || 0,
        instalacionesPendientes: instalacionesPend[0]?.total || 0
      }
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener estadísticas' });
  }
}

module.exports = { obtenerEstadisticas };

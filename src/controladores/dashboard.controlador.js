const { obtenerPool } = require('../configuracion/base_datos');

// ========================================
// ESTADÍSTICAS DEL DASHBOARD
// ========================================

async function obtenerEstadisticas(req, res) {
  try {
    const pool = obtenerPool();

    // Clientes activos
    const [activos] = await pool.query(
      `SELECT COUNT(*) as total FROM clientes WHERE estado = 'activo'`
    );

    // Clientes cancelados
    const [cancelados] = await pool.query(
      `SELECT COUNT(*) as total FROM clientes WHERE estado = 'cancelado'`
    );

    // Clientes suspendidos/deudores
    const [deudores] = await pool.query(
      `SELECT COUNT(*) as total FROM clientes WHERE estado = 'suspendido' OR saldo_pendiente > 0`
    );

    // Ingresos del mes actual
    const [ingresos] = await pool.query(
      `SELECT COALESCE(SUM(monto), 0) as total 
       FROM pagos 
       WHERE MONTH(fecha_pago) = MONTH(CURRENT_DATE()) 
       AND YEAR(fecha_pago) = YEAR(CURRENT_DATE())`
    );

    res.json({
      ok: true,
      estadisticas: {
        clientesActivos: activos[0].total,
        clientesCancelados: cancelados[0].total,
        clientesDeudores: deudores[0].total,
        ingresosMes: ingresos[0].total
      }
    });
  } catch (err) {
    console.error('❌ Error obtenerEstadisticas:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener estadísticas' });
  }
}

module.exports = {
  obtenerEstadisticas
};

const pool = require('../config/database');

const dashboard = async (req, res) => {
  try {
    const [clientesT] = await pool.query('SELECT COUNT(*) as t FROM clientes WHERE estado_cliente = 1');
    const [serviciosT] = await pool.query('SELECT COUNT(*) as t FROM servicios WHERE estado_servicio = 1');
    const [ingresoM] = await pool.query('SELECT COALESCE(SUM(tarifa_mensual), 0) as t FROM servicios WHERE estado_servicio = 1');
    
    const [pagosHoy] = await pool.query(
      `SELECT COUNT(*) as c, COALESCE(SUM(monto_pagado), 0) as m FROM pagos WHERE DATE(fecha_pago) = CURDATE()`
    );
    const [pagosMes] = await pool.query(
      `SELECT COUNT(*) as c, COALESCE(SUM(monto_pagado), 0) as m FROM pagos WHERE MONTH(fecha_pago) = MONTH(CURDATE()) AND YEAR(fecha_pago) = YEAR(CURDATE())`
    );
    
    // Adeudo total
    const [cargosT] = await pool.query('SELECT COALESCE(SUM(monto), 0) as t FROM cargos');
    const [pagadoT] = await pool.query('SELECT COALESCE(SUM(monto_aplicado), 0) as t FROM pagos_detalle');
    const adeudo = parseFloat(cargosT[0].t) - parseFloat(pagadoT[0].t);
    
    const [instalT] = await pool.query('SELECT COUNT(*) as t FROM instalaciones');
    
    const [ultimos] = await pool.query(
      `SELECT p.numero_recibo, p.monto_pagado as monto_total, c.nombre, c.apellido_paterno
       FROM pagos p JOIN clientes c ON p.cliente_id = c.id ORDER BY p.fecha_pago DESC LIMIT 5`
    );
    
    res.json({
      success: true,
      data: {
        clientes: { total: clientesT[0].t, activos: clientesT[0].t },
        servicios: { activos: serviciosT[0].t, ingreso_mensual: parseFloat(ingresoM[0].t) },
        pagos_hoy: { cantidad: pagosHoy[0].c, monto: parseFloat(pagosHoy[0].m) },
        pagos_mes: { cantidad: pagosMes[0].c, monto: parseFloat(pagosMes[0].m) },
        adeudo_total: adeudo > 0 ? adeudo : 0,
        instalaciones_pendientes: instalT[0].t,
        ultimos_pagos: ultimos.map(p => ({ numero_recibo: p.numero_recibo, monto_total: parseFloat(p.monto_total), cliente: `${p.nombre} ${p.apellido_paterno}` }))
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const clientesAdeudo = async (req, res) => {
  try {
    const { limite = 10 } = req.query;
    
    const [clientes] = await pool.query(
      `SELECT c.id, c.nombre, c.apellido_paterno, c.telefono_1,
              COALESCE(SUM(ca.monto), 0) as total_cargos
       FROM clientes c
       JOIN servicios s ON c.id = s.cliente_id
       JOIN cargos ca ON s.id = ca.servicio_id
       WHERE c.estado_cliente = 1
       GROUP BY c.id ORDER BY total_cargos DESC LIMIT ?`, [parseInt(limite)]
    );
    
    for (let c of clientes) {
      const [p] = await pool.query(
        `SELECT COALESCE(SUM(pd.monto_aplicado), 0) as t FROM pagos_detalle pd
         JOIN cargos ca ON pd.cargo_id = ca.id JOIN servicios s ON ca.servicio_id = s.id WHERE s.cliente_id = ?`, [c.id]
      );
      c.adeudo_total = parseFloat(c.total_cargos) - parseFloat(p[0].t);
      c.nombre_completo = `${c.nombre} ${c.apellido_paterno}`;
      c.telefono = c.telefono_1;
      c.numero_cliente = c.id.substring(0, 8).toUpperCase();
    }
    
    res.json({ success: true, data: clientes.filter(c => c.adeudo_total > 0) });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

module.exports = { dashboard, clientesAdeudo };

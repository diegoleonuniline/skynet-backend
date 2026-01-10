const pool = require('../config/database');

const dashboard = async (req, res) => {
  try {
    // Clientes
    const [clientesTotal] = await pool.query('SELECT COUNT(*) as total FROM clientes WHERE activo = 1');
    const [clientesActivos] = await pool.query('SELECT COUNT(*) as total FROM clientes WHERE activo = 1');
    
    // Servicios
    const [serviciosActivos] = await pool.query('SELECT COUNT(*) as total FROM servicios WHERE activo = 1');
    const [ingresoMensual] = await pool.query('SELECT COALESCE(SUM(precio_mensual), 0) as total FROM servicios WHERE activo = 1');
    
    // Pagos de hoy
    const [pagosHoy] = await pool.query(
      `SELECT COUNT(*) as cantidad, COALESCE(SUM(monto_total), 0) as monto 
       FROM pagos WHERE DATE(created_at) = CURDATE() AND activo = 1`
    );
    
    // Pagos del mes
    const [pagosMes] = await pool.query(
      `SELECT COUNT(*) as cantidad, COALESCE(SUM(monto_total), 0) as monto 
       FROM pagos WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) AND activo = 1`
    );
    
    // Adeudo total
    const [adeudo] = await pool.query('SELECT COALESCE(SUM(saldo), 0) as total FROM cargos WHERE saldo > 0 AND activo = 1');
    
    // Instalaciones pendientes
    const [instalaciones] = await pool.query('SELECT COUNT(*) as total FROM instalaciones WHERE activo = 1');
    
    // Últimos pagos
    const [ultimosPagos] = await pool.query(
      `SELECT p.numero_recibo, p.monto_total, c.nombre, c.apellido_paterno
       FROM pagos p
       JOIN clientes c ON p.cliente_id = c.id
       WHERE p.activo = 1
       ORDER BY p.created_at DESC LIMIT 5`
    );
    
    res.json({
      success: true,
      data: {
        clientes: {
          total: clientesTotal[0].total,
          activos: clientesActivos[0].total
        },
        servicios: {
          activos: serviciosActivos[0].total,
          ingreso_mensual: parseFloat(ingresoMensual[0].total)
        },
        pagos_hoy: {
          cantidad: pagosHoy[0].cantidad,
          monto: parseFloat(pagosHoy[0].monto)
        },
        pagos_mes: {
          cantidad: pagosMes[0].cantidad,
          monto: parseFloat(pagosMes[0].monto)
        },
        adeudo_total: parseFloat(adeudo[0].total),
        instalaciones_pendientes: instalaciones[0].total,
        ultimos_pagos: ultimosPagos.map(p => ({
          numero_recibo: p.numero_recibo,
          monto_total: parseFloat(p.monto_total),
          cliente: `${p.nombre} ${p.apellido_paterno}`
        }))
      }
    });
  } catch (error) {
    console.error('Error en dashboard:', error);
    res.status(500).json({ success: false, message: 'Error al obtener dashboard' });
  }
};

const clientesAdeudo = async (req, res) => {
  try {
    const { limite = 10 } = req.query;
    
    const [clientes] = await pool.query(
      `SELECT c.id as cliente_id, c.numero_cliente, c.nombre, c.apellido_paterno, c.telefono_principal,
              COALESCE(SUM(ca.saldo), 0) as adeudo_total,
              COUNT(DISTINCT CONCAT(ca.periodo_mes, '-', ca.periodo_anio)) as meses_adeudo
       FROM clientes c
       JOIN servicios s ON c.id = s.cliente_id
       JOIN cargos ca ON s.id = ca.servicio_id
       WHERE ca.saldo > 0 AND ca.activo = 1 AND c.activo = 1
       GROUP BY c.id
       ORDER BY adeudo_total DESC
       LIMIT ?`,
      [parseInt(limite)]
    );
    
    res.json({
      success: true,
      data: clientes.map(c => ({
        cliente_id: c.cliente_id,
        numero_cliente: c.numero_cliente,
        nombre_completo: `${c.nombre} ${c.apellido_paterno}`,
        telefono: c.telefono_principal,
        adeudo_total: parseFloat(c.adeudo_total),
        meses_adeudo: c.meses_adeudo
      }))
    });
  } catch (error) {
    console.error('Error en reporte:', error);
    res.status(500).json({ success: false, message: 'Error al obtener reporte' });
  }
};

module.exports = { dashboard, clientesAdeudo };

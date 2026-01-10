const pool = require('../config/database');
const cargosService = require('./cargos.service');

// Generar número de recibo único
const generarNumeroRecibo = async () => {
  const fecha = new Date();
  const prefix = `REC${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}`;
  
  const [ultimo] = await pool.query(
    `SELECT numero_recibo FROM pagos 
     WHERE numero_recibo LIKE ? 
     ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );
  
  let consecutivo = 1;
  if (ultimo.length > 0) {
    const ultimoNum = parseInt(ultimo[0].numero_recibo.slice(-5));
    consecutivo = ultimoNum + 1;
  }
  
  return `${prefix}${String(consecutivo).padStart(5, '0')}`;
};

// Aplicar pago a cargos
const aplicarPago = async (clienteId, montoTotal, tipoPagoId, referencia, notas, usuarioId) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Obtener IDs de estados
    const estadoPagoId = await cargosService.getCatalogoId('cat_estados_pago', 'Aplicado');
    
    // Crear el pago
    const numeroRecibo = await generarNumeroRecibo();
    const [pagoResult] = await connection.query(
      `INSERT INTO pagos 
       (cliente_id, numero_recibo, monto_total, tipo_pago_id, referencia, estado_id, notas, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [clienteId, numeroRecibo, montoTotal, tipoPagoId, referencia, estadoPagoId, notas, usuarioId]
    );
    
    const pagoId = pagoResult.insertId;
    let montoRestante = parseFloat(montoTotal);
    const detallesAplicados = [];
    
    // Obtener cargos pendientes ordenados por fecha de vencimiento
    const [cargosPendientes] = await connection.query(
      `SELECT c.* FROM cargos c
       JOIN servicios s ON c.servicio_id = s.id
       WHERE s.cliente_id = ? AND c.saldo > 0 AND c.activo = 1
       ORDER BY c.fecha_vencimiento ASC`,
      [clienteId]
    );
    
    // Aplicar pago a cada cargo
    for (const cargo of cargosPendientes) {
      if (montoRestante <= 0) break;
      
      const montoAplicar = Math.min(montoRestante, parseFloat(cargo.saldo));
      const nuevoSaldo = parseFloat(cargo.saldo) - montoAplicar;
      const nuevoMontoPagado = parseFloat(cargo.monto_pagado) + montoAplicar;
      
      // Actualizar cargo
      await connection.query(
        `UPDATE cargos SET saldo = ?, monto_pagado = ?, updated_by = ? WHERE id = ?`,
        [nuevoSaldo, nuevoMontoPagado, usuarioId, cargo.id]
      );
      
      // Registrar detalle del pago
      await connection.query(
        `INSERT INTO pago_detalles (pago_id, cargo_id, monto_aplicado) VALUES (?, ?, ?)`,
        [pagoId, cargo.id, montoAplicar]
      );
      
      detallesAplicados.push({
        cargo_id: cargo.id,
        concepto: cargo.concepto,
        monto_aplicado: montoAplicar
      });
      
      montoRestante -= montoAplicar;
      
      // Actualizar estado del cargo
      await cargosService.actualizarEstadoCargo(cargo.id);
    }
    
    // Si queda monto restante, crear saldo a favor
    let saldoFavorId = null;
    if (montoRestante > 0) {
      const [saldoResult] = await connection.query(
        `INSERT INTO saldos_favor 
         (cliente_id, monto_original, monto_disponible, pago_origen_id, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [clienteId, montoRestante, montoRestante, pagoId, usuarioId]
      );
      saldoFavorId = saldoResult.insertId;
    }
    
    await connection.commit();
    
    return {
      success: true,
      pago_id: pagoId,
      numero_recibo: numeroRecibo,
      monto_aplicado: montoTotal - montoRestante,
      saldo_favor: montoRestante,
      saldo_favor_id: saldoFavorId,
      detalles: detallesAplicados
    };
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Obtener saldo a favor de un cliente
const obtenerSaldoFavor = async (clienteId) => {
  const [result] = await pool.query(
    `SELECT COALESCE(SUM(monto_disponible), 0) as saldo_favor
     FROM saldos_favor
     WHERE cliente_id = ? AND monto_disponible > 0 AND activo = 1`,
    [clienteId]
  );
  return result[0].saldo_favor;
};

// Obtener resumen financiero del cliente
const obtenerResumenCliente = async (clienteId) => {
  const adeudo = await cargosService.obtenerAdeudoCliente(clienteId);
  const saldoFavor = await obtenerSaldoFavor(clienteId);
  
  const [ultimoPago] = await pool.query(
    `SELECT fecha_pago, monto_total, numero_recibo
     FROM pagos
     WHERE cliente_id = ? AND activo = 1
     ORDER BY fecha_pago DESC LIMIT 1`,
    [clienteId]
  );
  
  return {
    adeudo_total: adeudo,
    saldo_favor: saldoFavor,
    balance: saldoFavor - adeudo,
    ultimo_pago: ultimoPago.length > 0 ? ultimoPago[0] : null
  };
};

// Obtener historial de pagos
const obtenerHistorialPagos = async (clienteId, limit = 50) => {
  const [pagos] = await pool.query(
    `SELECT p.*, tp.nombre as tipo_pago, ep.nombre as estado,
            u.nombre_completo as registrado_por
     FROM pagos p
     JOIN cat_tipos_pago tp ON p.tipo_pago_id = tp.id
     JOIN cat_estados_pago ep ON p.estado_id = ep.id
     JOIN usuarios u ON p.created_by = u.id
     WHERE p.cliente_id = ? AND p.activo = 1
     ORDER BY p.fecha_pago DESC
     LIMIT ?`,
    [clienteId, limit]
  );
  
  // Obtener detalles de cada pago
  for (const pago of pagos) {
    const [detalles] = await pool.query(
      `SELECT pd.*, c.concepto
       FROM pago_detalles pd
       JOIN cargos c ON pd.cargo_id = c.id
       WHERE pd.pago_id = ?`,
      [pago.id]
    );
    pago.detalles = detalles;
  }
  
  return pagos;
};

module.exports = {
  generarNumeroRecibo,
  aplicarPago,
  obtenerSaldoFavor,
  obtenerResumenCliente,
  obtenerHistorialPagos
};

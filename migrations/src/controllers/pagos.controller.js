const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const listar = async (req, res) => {
  try {
    const { cliente_id, limit = 50 } = req.query;
    
    let query = `
      SELECT p.*, tp.nombre as tipo_pago,
             c.nombre as cliente_nombre, c.apellido_paterno
      FROM pagos p
      LEFT JOIN catalogo_metodos_pago tp ON p.tipo_pago_id = tp.id
      LEFT JOIN clientes c ON p.cliente_id = c.id
      WHERE p.activo = 1
    `;
    const params = [];
    
    if (cliente_id) {
      query += ` AND p.cliente_id = ?`;
      params.push(cliente_id);
    }
    
    query += ` ORDER BY p.fecha_pago DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    const [pagos] = await pool.query(query, params);
    
    for (let pago of pagos) {
      pago.estado = pago.activo ? 'Aplicado' : 'Cancelado';
      pago.cliente_nombre = `${pago.cliente_nombre || ''} ${pago.apellido_paterno || ''}`.trim();
    }
    
    res.json({ success: true, data: pagos });
  } catch (error) {
    console.error('Error listando pagos:', error);
    res.status(500).json({ success: false, message: 'Error al listar pagos' });
  }
};

const preview = async (req, res) => {
  try {
    const { cliente_id, monto_total } = req.body;
    
    if (!cliente_id || !monto_total) {
      return res.status(400).json({ success: false, message: 'Cliente y monto son requeridos' });
    }
    
    // Obtener cargos pendientes ordenados por fecha (FIFO)
    const [cargos] = await pool.query(
      `SELECT c.* FROM cargos c
       JOIN servicios s ON c.servicio_id = s.id
       WHERE s.cliente_id = ? AND c.saldo > 0 AND c.activo = 1
       ORDER BY c.fecha_vencimiento ASC`,
      [cliente_id]
    );
    
    let montoRestante = parseFloat(monto_total);
    const cargosACubrir = [];
    
    for (const cargo of cargos) {
      if (montoRestante <= 0) break;
      
      const montoAAplicar = Math.min(montoRestante, parseFloat(cargo.saldo));
      cargosACubrir.push({
        cargo_id: cargo.id,
        concepto: cargo.concepto,
        saldo_actual: parseFloat(cargo.saldo),
        monto_a_aplicar: montoAAplicar
      });
      montoRestante -= montoAAplicar;
    }
    
    res.json({
      success: true,
      data: {
        cargos_a_cubrir: cargosACubrir,
        saldo_favor_resultante: montoRestante > 0 ? montoRestante : 0
      }
    });
  } catch (error) {
    console.error('Error en preview:', error);
    res.status(500).json({ success: false, message: 'Error al generar preview' });
  }
};

const crear = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { cliente_id, monto_total, tipo_pago_id, referencia, notas } = req.body;
    
    if (!cliente_id || !monto_total || !tipo_pago_id) {
      return res.status(400).json({ success: false, message: 'Cliente, monto y tipo de pago son requeridos' });
    }
    
    // Generar número de recibo
    const [lastPago] = await connection.query(
      'SELECT numero_recibo FROM pagos ORDER BY created_at DESC LIMIT 1'
    );
    let nextNum = 1;
    if (lastPago.length > 0 && lastPago[0].numero_recibo) {
      const match = lastPago[0].numero_recibo.match(/\d+/);
      if (match) nextNum = parseInt(match[0]) + 1;
    }
    const numero_recibo = `REC-${String(nextNum).padStart(6, '0')}`;
    
    const pagoId = uuidv4();
    
    // Insertar pago
    await connection.query(
      `INSERT INTO pagos (id, cliente_id, numero_recibo, monto_total, tipo_pago_id, referencia, notas, activo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [pagoId, cliente_id, numero_recibo, monto_total, tipo_pago_id, referencia || null, notas || null, req.userId]
    );
    
    // Obtener cargos pendientes (FIFO)
    const [cargos] = await connection.query(
      `SELECT c.* FROM cargos c
       JOIN servicios s ON c.servicio_id = s.id
       WHERE s.cliente_id = ? AND c.saldo > 0 AND c.activo = 1
       ORDER BY c.fecha_vencimiento ASC`,
      [cliente_id]
    );
    
    let montoRestante = parseFloat(monto_total);
    
    // Aplicar pago a cargos
    for (const cargo of cargos) {
      if (montoRestante <= 0) break;
      
      const montoAAplicar = Math.min(montoRestante, parseFloat(cargo.saldo));
      
      // Insertar detalle
      await connection.query(
        `INSERT INTO pagos_detalle (id, pago_id, cargo_id, monto_aplicado)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), pagoId, cargo.id, montoAAplicar]
      );
      
      // Actualizar cargo
      await connection.query(
        `UPDATE cargos SET monto_pagado = monto_pagado + ?, saldo = saldo - ?, updated_by = ? WHERE id = ?`,
        [montoAAplicar, montoAAplicar, req.userId, cargo.id]
      );
      
      montoRestante -= montoAAplicar;
    }
    
    // Si queda saldo a favor, se podría registrar aquí
    
    await connection.commit();
    
    res.status(201).json({
      success: true,
      message: 'Pago registrado correctamente',
      data: { id: pagoId, numero_recibo }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creando pago:', error);
    res.status(500).json({ success: false, message: 'Error al registrar pago' });
  } finally {
    connection.release();
  }
};

module.exports = { listar, preview, crear };

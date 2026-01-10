const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// cargos: id, servicio_id, tipo_cargo_id, periodo_inicio, periodo_fin, fecha_vencimiento, monto, estado_cargo

const listar = async (req, res) => {
  try {
    const { cliente_id, servicio_id, solo_pendientes, limit = 100 } = req.query;
    
    let query = `SELECT c.*, tc.nombre as tipo_cargo, s.cliente_id
                 FROM cargos c
                 LEFT JOIN catalogo_tipos_cargo tc ON c.tipo_cargo_id = tc.id
                 JOIN servicios s ON c.servicio_id = s.id WHERE 1=1`;
    const params = [];
    
    if (cliente_id) { query += ` AND s.cliente_id = ?`; params.push(cliente_id); }
    if (servicio_id) { query += ` AND c.servicio_id = ?`; params.push(servicio_id); }
    query += ` ORDER BY c.fecha_vencimiento ASC LIMIT ?`; params.push(parseInt(limit));
    
    const [cargos] = await pool.query(query, params);
    
    for (let c of cargos) {
      const [p] = await pool.query('SELECT COALESCE(SUM(monto_aplicado), 0) as t FROM pagos_detalle WHERE cargo_id = ?', [c.id]);
      c.monto_pagado = parseFloat(p[0].t);
      c.saldo = parseFloat(c.monto) - c.monto_pagado;
      c.estado = c.saldo <= 0 ? 'Pagado' : c.monto_pagado > 0 ? 'Parcial' : 'Pendiente';
      c.concepto = c.tipo_cargo || 'Mensualidad';
    }
    
    let result = cargos;
    if (solo_pendientes === 'true') result = cargos.filter(c => c.saldo > 0);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const crear = async (req, res) => {
  try {
    const { servicio_id, tipo_cargo_id, monto, fecha_vencimiento, periodo_inicio, periodo_fin } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO cargos (id, servicio_id, tipo_cargo_id, monto, fecha_vencimiento, periodo_inicio, periodo_fin, estado_cargo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)`,
      [id, servicio_id, tipo_cargo_id || null, monto, fecha_vencimiento, periodo_inicio || null, periodo_fin || null, req.userId]
    );
    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

module.exports = { listar, crear };

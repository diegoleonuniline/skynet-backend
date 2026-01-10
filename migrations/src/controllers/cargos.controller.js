const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const listar = async (req, res) => {
  try {
    const { cliente_id, servicio_id, solo_pendientes, limit = 100 } = req.query;
    
    let query = `
      SELECT c.*, tc.nombre as tipo_cargo,
             cl.nombre as cliente_nombre, cl.apellido_paterno
      FROM cargos c
      LEFT JOIN catalogo_tipos_cargo tc ON c.tipo_cargo_id = tc.id
      LEFT JOIN servicios s ON c.servicio_id = s.id
      LEFT JOIN clientes cl ON s.cliente_id = cl.id
      WHERE c.activo = 1
    `;
    const params = [];
    
    if (cliente_id) {
      query += ` AND s.cliente_id = ?`;
      params.push(cliente_id);
    }
    
    if (servicio_id) {
      query += ` AND c.servicio_id = ?`;
      params.push(servicio_id);
    }
    
    if (solo_pendientes === 'true') {
      query += ` AND c.saldo > 0`;
    }
    
    query += ` ORDER BY c.fecha_vencimiento ASC LIMIT ?`;
    params.push(parseInt(limit));
    
    const [cargos] = await pool.query(query, params);
    
    for (let cargo of cargos) {
      if (cargo.saldo <= 0) cargo.estado = 'Pagado';
      else if (cargo.monto_pagado > 0) cargo.estado = 'Parcial';
      else cargo.estado = 'Pendiente';
    }
    
    res.json({ success: true, data: cargos });
  } catch (error) {
    console.error('Error listando cargos:', error);
    res.status(500).json({ success: false, message: 'Error al listar cargos' });
  }
};

const crear = async (req, res) => {
  try {
    const { servicio_id, tipo_cargo_id, concepto, monto, fecha_vencimiento, periodo_mes, periodo_anio } = req.body;
    
    const id = uuidv4();
    
    await pool.query(
      `INSERT INTO cargos (id, servicio_id, tipo_cargo_id, concepto, monto, monto_pagado, saldo, 
        fecha_emision, fecha_vencimiento, periodo_mes, periodo_anio, activo, created_by)
       VALUES (?, ?, ?, ?, ?, 0, ?, CURDATE(), ?, ?, ?, 1, ?)`,
      [id, servicio_id, tipo_cargo_id, concepto, monto, monto, fecha_vencimiento, periodo_mes, periodo_anio, req.userId]
    );
    
    res.status(201).json({ success: true, message: 'Cargo creado', data: { id } });
  } catch (error) {
    console.error('Error creando cargo:', error);
    res.status(500).json({ success: false, message: 'Error al crear cargo' });
  }
};

module.exports = { listar, crear };

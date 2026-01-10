const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const listar = async (req, res) => {
  try {
    const { cliente_id, limit = 50 } = req.query;
    
    let query = `
      SELECT s.*, c.nombre as cliente_nombre, c.apellido_paterno,
             t.nombre as tarifa_nombre, t.velocidad_mbps
      FROM servicios s
      JOIN clientes c ON s.cliente_id = c.id
      LEFT JOIN catalogo_tarifas t ON s.tarifa_id = t.id
      WHERE s.activo = 1
    `;
    const params = [];
    
    if (cliente_id) {
      query += ` AND s.cliente_id = ?`;
      params.push(cliente_id);
    }
    
    query += ` ORDER BY s.created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    const [servicios] = await pool.query(query, params);
    
    for (let s of servicios) {
      s.estado = s.activo ? 'Activo' : 'Inactivo';
      s.cliente_nombre = `${s.cliente_nombre} ${s.apellido_paterno}`;
    }
    
    res.json({ success: true, data: servicios });
  } catch (error) {
    console.error('Error listando servicios:', error);
    res.status(500).json({ success: false, message: 'Error al listar servicios' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [servicios] = await pool.query(
      `SELECT s.*, c.nombre as cliente_nombre, t.nombre as tarifa_nombre, t.velocidad_mbps
       FROM servicios s
       JOIN clientes c ON s.cliente_id = c.id
       LEFT JOIN catalogo_tarifas t ON s.tarifa_id = t.id
       WHERE s.id = ?`,
      [id]
    );
    
    if (servicios.length === 0) {
      return res.status(404).json({ success: false, message: 'Servicio no encontrado' });
    }
    
    res.json({ success: true, data: servicios[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener servicio' });
  }
};

const crear = async (req, res) => {
  try {
    const { cliente_id, tarifa_id, precio_mensual, dia_corte = 10, fecha_inicio, ip_asignada } = req.body;
    
    if (!cliente_id || !tarifa_id || !fecha_inicio) {
      return res.status(400).json({
        success: false,
        message: 'Cliente, tarifa y fecha de inicio son requeridos'
      });
    }
    
    // Obtener precio de tarifa si no se especifica
    let precio = precio_mensual;
    if (!precio) {
      const [tarifas] = await pool.query('SELECT precio FROM catalogo_tarifas WHERE id = ?', [tarifa_id]);
      precio = tarifas[0]?.precio || 0;
    }
    
    const id = uuidv4();
    
    await pool.query(
      `INSERT INTO servicios (id, cliente_id, tarifa_id, precio_mensual, dia_corte, fecha_inicio, ip_asignada, activo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, cliente_id, tarifa_id, precio, dia_corte, fecha_inicio, ip_asignada || null, req.userId]
    );
    
    res.status(201).json({ success: true, message: 'Servicio creado', data: { id } });
  } catch (error) {
    console.error('Error creando servicio:', error);
    res.status(500).json({ success: false, message: 'Error al crear servicio' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { tarifa_id, precio_mensual, dia_corte, ip_asignada, activo } = req.body;
    
    const updates = [];
    const values = [];
    
    if (tarifa_id) { updates.push('tarifa_id = ?'); values.push(tarifa_id); }
    if (precio_mensual) { updates.push('precio_mensual = ?'); values.push(precio_mensual); }
    if (dia_corte) { updates.push('dia_corte = ?'); values.push(dia_corte); }
    if (ip_asignada !== undefined) { updates.push('ip_asignada = ?'); values.push(ip_asignada); }
    if (activo !== undefined) { updates.push('activo = ?'); values.push(activo); }
    
    updates.push('updated_by = ?');
    values.push(req.userId);
    values.push(id);
    
    await pool.query(`UPDATE servicios SET ${updates.join(', ')} WHERE id = ?`, values);
    
    res.json({ success: true, message: 'Servicio actualizado' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al actualizar servicio' });
  }
};

module.exports = { listar, obtener, crear, actualizar };

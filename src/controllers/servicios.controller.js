const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// servicios: id, cliente_id, tarifa_mensual, dia_corte, estado_servicio, fecha_inicio, fecha_cancelacion

const listar = async (req, res) => {
  try {
    const { cliente_id, limit = 50 } = req.query;
    
    let query = `SELECT s.*, c.nombre as cliente_nombre, c.apellido_paterno
                 FROM servicios s JOIN clientes c ON s.cliente_id = c.id WHERE s.estado_servicio = 1`;
    const params = [];
    
    if (cliente_id) { query += ` AND s.cliente_id = ?`; params.push(cliente_id); }
    query += ` ORDER BY s.created_at DESC LIMIT ?`; params.push(parseInt(limit));
    
    const [servicios] = await pool.query(query, params);
    for (let s of servicios) {
      s.estado = s.estado_servicio ? 'Activo' : 'Inactivo';
      s.cliente_nombre = `${s.cliente_nombre} ${s.apellido_paterno}`;
      s.precio_mensual = s.tarifa_mensual;
      s.tarifa_nombre = `Plan $${s.tarifa_mensual}`;
    }
    res.json({ success: true, data: servicios });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const [r] = await pool.query(`SELECT s.*, c.nombre as cliente_nombre FROM servicios s JOIN clientes c ON s.cliente_id = c.id WHERE s.id = ?`, [id]);
    if (r.length === 0) return res.status(404).json({ success: false, message: 'No encontrado' });
    r[0].precio_mensual = r[0].tarifa_mensual;
    res.json({ success: true, data: r[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const crear = async (req, res) => {
  try {
    const { cliente_id, tarifa_mensual, precio_mensual, dia_corte = 10, fecha_inicio } = req.body;
    if (!cliente_id || !fecha_inicio) return res.status(400).json({ success: false, message: 'Cliente y fecha requeridos' });
    
    const precio = tarifa_mensual || precio_mensual || 0;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO servicios (id, cliente_id, tarifa_mensual, dia_corte, fecha_inicio, estado_servicio, created_by) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [id, cliente_id, precio, dia_corte, fecha_inicio, req.userId]
    );
    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { tarifa_mensual, precio_mensual, dia_corte, estado_servicio } = req.body;
    
    const u = [], v = [];
    if (tarifa_mensual || precio_mensual) { u.push('tarifa_mensual = ?'); v.push(tarifa_mensual || precio_mensual); }
    if (dia_corte) { u.push('dia_corte = ?'); v.push(dia_corte); }
    if (estado_servicio !== undefined) { u.push('estado_servicio = ?'); v.push(estado_servicio); }
    u.push('updated_by = ?'); v.push(req.userId); v.push(id);
    
    await pool.query(`UPDATE servicios SET ${u.join(', ')} WHERE id = ?`, v);
    res.json({ success: true, message: 'Actualizado' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

module.exports = { listar, obtener, crear, actualizar };

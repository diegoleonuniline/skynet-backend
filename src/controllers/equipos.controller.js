const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const listar = async (req, res) => {
  try {
    const { servicio_id, limit = 100 } = req.query;
    
    let query = `
      SELECT e.*, te.nombre as tipo
      FROM equipos e
      LEFT JOIN catalogo_tipos_equipo te ON e.tipo_id = te.id
      WHERE e.activo = 1
    `;
    const params = [];
    
    if (servicio_id) {
      query += ` AND e.servicio_id = ?`;
      params.push(servicio_id);
    }
    
    query += ` ORDER BY e.created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    const [equipos] = await pool.query(query, params);
    
    res.json({ success: true, data: equipos });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al listar equipos' });
  }
};

const crear = async (req, res) => {
  try {
    const { servicio_id, tipo_id, marca, modelo, mac_address, numero_serie, ip } = req.body;
    
    const id = uuidv4();
    
    await pool.query(
      `INSERT INTO equipos (id, servicio_id, tipo_id, marca, modelo, mac_address, numero_serie, ip, activo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, servicio_id, tipo_id, marca, modelo, mac_address || null, numero_serie || null, ip || null, req.userId]
    );
    
    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al crear equipo' });
  }
};

module.exports = { listar, crear };

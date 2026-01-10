const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// equipos: id, servicio_id, tipo_equipo_id, mac, marca, modelo, ip, ssid, serie, nombre_red, password_red

const listar = async (req, res) => {
  try {
    const { servicio_id, cliente_id, limit = 100 } = req.query;
    
    let query = `SELECT e.*, te.nombre as tipo
                 FROM equipos e
                 LEFT JOIN catalogo_tipos_equipo te ON e.tipo_equipo_id = te.id
                 JOIN servicios s ON e.servicio_id = s.id WHERE 1=1`;
    const params = [];
    
    if (servicio_id) { query += ` AND e.servicio_id = ?`; params.push(servicio_id); }
    if (cliente_id) { query += ` AND s.cliente_id = ?`; params.push(cliente_id); }
    query += ` ORDER BY e.created_at DESC LIMIT ?`; params.push(parseInt(limit));
    
    const [equipos] = await pool.query(query, params);
    res.json({ success: true, data: equipos });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const crear = async (req, res) => {
  try {
    const { servicio_id, tipo_equipo_id, mac, marca, modelo, ip, ssid, serie, nombre_red, password_red } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO equipos (id, servicio_id, tipo_equipo_id, mac, marca, modelo, ip, ssid, serie, nombre_red, password_red, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, servicio_id, tipo_equipo_id || null, mac || null, marca || null, modelo || null, ip || null, ssid || null, serie || null, nombre_red || null, password_red || null, req.userId]
    );
    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

module.exports = { listar, crear };

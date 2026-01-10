const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// instalaciones: id, servicio_id, fecha_instalacion, costo_instalacion, tecnico_instalador

const listar = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const [instalaciones] = await pool.query(
      `SELECT i.*, c.nombre as cliente_nombre, c.apellido_paterno, c.calle, c.numero
       FROM instalaciones i
       JOIN servicios s ON i.servicio_id = s.id
       JOIN clientes c ON s.cliente_id = c.id
       ORDER BY i.fecha_instalacion DESC LIMIT ?`, [parseInt(limit)]
    );
    
    for (let i of instalaciones) {
      i.cliente_nombre = `${i.cliente_nombre} ${i.apellido_paterno}`;
      i.direccion = `${i.calle || ''} ${i.numero || ''}`.trim();
      i.estado = 'Completada';
      i.fecha_programada = i.fecha_instalacion;
    }
    res.json({ success: true, data: instalaciones });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const crear = async (req, res) => {
  try {
    const { servicio_id, fecha_instalacion, costo_instalacion, tecnico_instalador } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO instalaciones (id, servicio_id, fecha_instalacion, costo_instalacion, tecnico_instalador, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, servicio_id, fecha_instalacion, costo_instalacion || null, tecnico_instalador || null, req.userId]
    );
    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

module.exports = { listar, crear };

const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const listar = async (req, res) => {
  try {
    const { estado_id, limit = 50 } = req.query;
    
    let query = `
      SELECT i.*, c.nombre as cliente_nombre, c.apellido_paterno, c.calle, c.numero_exterior
      FROM instalaciones i
      JOIN servicios s ON i.servicio_id = s.id
      JOIN clientes c ON s.cliente_id = c.id
      WHERE i.activo = 1
    `;
    const params = [];
    
    if (estado_id) {
      query += ` AND i.estado_id = ?`;
      params.push(estado_id);
    }
    
    query += ` ORDER BY i.fecha_programada DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    const [instalaciones] = await pool.query(query, params);
    
    for (let inst of instalaciones) {
      inst.cliente_nombre = `${inst.cliente_nombre} ${inst.apellido_paterno}`;
      inst.direccion = `${inst.calle || ''} ${inst.numero_exterior || ''}`.trim();
      inst.estado = inst.activo ? 'Programada' : 'Completada';
    }
    
    res.json({ success: true, data: instalaciones });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al listar instalaciones' });
  }
};

const crear = async (req, res) => {
  try {
    const { servicio_id, fecha_programada, tecnico_id, notas } = req.body;
    
    const id = uuidv4();
    
    await pool.query(
      `INSERT INTO instalaciones (id, servicio_id, fecha_programada, tecnico_id, notas, activo, created_by)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [id, servicio_id, fecha_programada, tecnico_id || null, notas || null, req.userId]
    );
    
    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al crear instalación' });
  }
};

module.exports = { listar, crear };

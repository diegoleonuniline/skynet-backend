const pool = require('../config/database');
const { registrarCreacion, registrarEdicion, registrarEliminacion } = require('../services/historial.service');

// Listar equipos
const listar = async (req, res) => {
  try {
    const { servicio_id, tipo, page = 1, limit = 20 } = req.query;
    
    let query = `
      SELECT e.*, 
             s.ip_asignada as servicio_ip,
             c.nombre as cliente_nombre,
             c.apellido_paterno as cliente_apellido,
             c.numero_cliente
      FROM equipos e
      JOIN servicios s ON e.servicio_id = s.id
      JOIN clientes c ON s.cliente_id = c.id
      WHERE e.activo = 1
    `;
    
    const params = [];
    
    if (servicio_id) {
      query += ` AND e.servicio_id = ?`;
      params.push(servicio_id);
    }
    
    if (tipo) {
      query += ` AND e.tipo = ?`;
      params.push(tipo);
    }
    
    const offset = (page - 1) * limit;
    query += ` ORDER BY e.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [equipos] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: equipos
    });
    
  } catch (error) {
    console.error('Error listando equipos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar equipos'
    });
  }
};

// Obtener equipo por ID
const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [equipos] = await pool.query(
      `SELECT e.*, 
              s.ip_asignada as servicio_ip,
              c.nombre as cliente_nombre,
              c.apellido_paterno as cliente_apellido,
              c.numero_cliente
       FROM equipos e
       JOIN servicios s ON e.servicio_id = s.id
       JOIN clientes c ON s.cliente_id = c.id
       WHERE e.id = ? AND e.activo = 1`,
      [id]
    );
    
    if (equipos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Equipo no encontrado'
      });
    }
    
    res.json({
      success: true,
      data: equipos[0]
    });
    
  } catch (error) {
    console.error('Error obteniendo equipo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener equipo'
    });
  }
};

// Crear equipo
const crear = async (req, res) => {
  try {
    const {
      servicio_id,
      tipo,
      marca,
      modelo,
      mac_address,
      ip,
      ssid,
      password_wifi,
      numero_serie,
      notas
    } = req.body;
    
    if (!servicio_id || !tipo) {
      return res.status(400).json({
        success: false,
        message: 'Servicio y tipo de equipo son requeridos'
      });
    }
    
    // Verificar servicio existe
    const [servicio] = await pool.query(
      'SELECT id FROM servicios WHERE id = ? AND activo = 1',
      [servicio_id]
    );
    
    if (servicio.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Servicio no encontrado'
      });
    }
    
    // Verificar MAC no duplicada
    if (mac_address) {
      const [existente] = await pool.query(
        'SELECT id FROM equipos WHERE mac_address = ? AND activo = 1',
        [mac_address]
      );
      
      if (existente.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un equipo con esa MAC'
        });
      }
    }
    
    const [result] = await pool.query(
      `INSERT INTO equipos 
       (servicio_id, tipo, marca, modelo, mac_address, ip, ssid, password_wifi, numero_serie, notas, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [servicio_id, tipo, marca, modelo, mac_address, ip, ssid, password_wifi, numero_serie, notas, req.userId]
    );
    
    await registrarCreacion('equipos', result.insertId, req.userId, req.ip);
    
    res.status(201).json({
      success: true,
      message: 'Equipo registrado correctamente',
      data: {
        id: result.insertId
      }
    });
    
  } catch (error) {
    console.error('Error creando equipo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar equipo'
    });
  }
};

// Actualizar equipo
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    
    const [actual] = await pool.query(
      'SELECT * FROM equipos WHERE id = ? AND activo = 1',
      [id]
    );
    
    if (actual.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Equipo no encontrado'
      });
    }
    
    const permitidos = ['tipo', 'marca', 'modelo', 'mac_address', 'ip', 'ssid', 'password_wifi', 'numero_serie', 'notas'];
    const updates = [];
    const values = [];
    const cambios = {};
    
    for (const campo of permitidos) {
      if (campos[campo] !== undefined && campos[campo] !== actual[0][campo]) {
        updates.push(`${campo} = ?`);
        values.push(campos[campo]);
        cambios[campo] = {
          anterior: actual[0][campo],
          nuevo: campos[campo]
        };
      }
    }
    
    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'No hay cambios que guardar'
      });
    }
    
    updates.push('updated_by = ?');
    values.push(req.userId);
    values.push(id);
    
    await pool.query(
      `UPDATE equipos SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    await registrarEdicion('equipos', id, cambios, req.userId, req.ip);
    
    res.json({
      success: true,
      message: 'Equipo actualizado correctamente'
    });
    
  } catch (error) {
    console.error('Error actualizando equipo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar equipo'
    });
  }
};

// Eliminar equipo (borrado lógico)
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE equipos SET activo = 0, updated_by = ? WHERE id = ?',
      [req.userId, id]
    );
    
    await registrarEliminacion('equipos', id, req.userId, req.ip);
    
    res.json({
      success: true,
      message: 'Equipo eliminado correctamente'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar equipo'
    });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar
};

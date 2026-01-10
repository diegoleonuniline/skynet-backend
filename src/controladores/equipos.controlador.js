const { obtenerPool } = require('../configuracion/base_datos');

// ========================================
// CATÁLOGOS DE EQUIPOS
// ========================================

// Obtener tipos de equipo
async function obtenerTiposEquipo(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query('SELECT * FROM tipos_equipo WHERE activo = 1 ORDER BY nombre');
    res.json({ ok: true, tipos: rows });
  } catch (err) {
    console.error('❌ Error obtenerTiposEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener tipos' });
  }
}

// Crear tipo de equipo
async function crearTipoEquipo(req, res) {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Nombre es requerido' });

    const pool = obtenerPool();
    const id = generarUUID();
    await pool.query('INSERT INTO tipos_equipo (id, nombre, descripcion) VALUES (?, ?, ?)', [id, nombre, descripcion]);
    res.json({ ok: true, mensaje: 'Tipo creado', tipo: { id, nombre, descripcion } });
  } catch (err) {
    console.error('❌ Error crearTipoEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear tipo' });
  }
}

// Actualizar tipo de equipo
async function actualizarTipoEquipo(req, res) {
  try {
    const { id } = req.params;
    const { nombre, descripcion, activo } = req.body;
    const pool = obtenerPool();
    await pool.query('UPDATE tipos_equipo SET nombre = ?, descripcion = ?, activo = ? WHERE id = ?', 
      [nombre, descripcion, activo !== undefined ? activo : 1, id]);
    res.json({ ok: true, mensaje: 'Tipo actualizado' });
  } catch (err) {
    console.error('❌ Error actualizarTipoEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar tipo' });
  }
}

// Eliminar tipo de equipo (soft delete)
async function eliminarTipoEquipo(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();
    await pool.query('UPDATE tipos_equipo SET activo = 0 WHERE id = ?', [id]);
    res.json({ ok: true, mensaje: 'Tipo eliminado' });
  } catch (err) {
    console.error('❌ Error eliminarTipoEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar tipo' });
  }
}

// Obtener estados de equipo
async function obtenerEstadosEquipo(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query('SELECT * FROM estados_equipo WHERE activo = 1 ORDER BY nombre');
    res.json({ ok: true, estados: rows });
  } catch (err) {
    console.error('❌ Error obtenerEstadosEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener estados' });
  }
}

// Crear estado de equipo
async function crearEstadoEquipo(req, res) {
  try {
    const { nombre, color, es_operativo } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Nombre es requerido' });

    const pool = obtenerPool();
    const id = generarUUID();
    await pool.query('INSERT INTO estados_equipo (id, nombre, color, es_operativo) VALUES (?, ?, ?, ?)', 
      [id, nombre, color || '#64748b', es_operativo || 0]);
    res.json({ ok: true, mensaje: 'Estado creado', estado: { id, nombre, color, es_operativo } });
  } catch (err) {
    console.error('❌ Error crearEstadoEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear estado' });
  }
}

// Actualizar estado de equipo
async function actualizarEstadoEquipo(req, res) {
  try {
    const { id } = req.params;
    const { nombre, color, es_operativo, activo } = req.body;
    const pool = obtenerPool();
    await pool.query('UPDATE estados_equipo SET nombre = ?, color = ?, es_operativo = ?, activo = ? WHERE id = ?', 
      [nombre, color, es_operativo, activo !== undefined ? activo : 1, id]);
    res.json({ ok: true, mensaje: 'Estado actualizado' });
  } catch (err) {
    console.error('❌ Error actualizarEstadoEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar estado' });
  }
}

// Eliminar estado de equipo (soft delete)
async function eliminarEstadoEquipo(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();
    await pool.query('UPDATE estados_equipo SET activo = 0 WHERE id = ?', [id]);
    res.json({ ok: true, mensaje: 'Estado eliminado' });
  } catch (err) {
    console.error('❌ Error eliminarEstadoEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar estado' });
  }
}

// ========================================
// EQUIPOS
// ========================================

// Obtener todos los equipos con joins a catálogos
async function obtenerEquipos(req, res) {
  try {
    const { cliente_id } = req.query;
    const pool = obtenerPool();
    
    let query = `
      SELECT e.*, 
             t.nombre as tipo_nombre,
             s.nombre as estado_nombre,
             s.color as estado_color,
             s.es_operativo
      FROM equipos e
      LEFT JOIN tipos_equipo t ON e.tipo = t.id
      LEFT JOIN estados_equipo s ON e.estado = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (cliente_id) {
      query += ` AND e.cliente_id = ?`;
      params.push(cliente_id);
    }
    
    query += ` ORDER BY e.creado_en DESC`;
    
    const [rows] = await pool.query(query, params);
    res.json({ ok: true, equipos: rows });
  } catch (err) {
    console.error('❌ Error obtenerEquipos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener equipos' });
  }
}

// Obtener equipo por ID
async function obtenerEquipoPorId(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();
    
    const [rows] = await pool.query(`
      SELECT e.*, 
             t.nombre as tipo_nombre,
             s.nombre as estado_nombre,
             s.color as estado_color,
             s.es_operativo
      FROM equipos e
      LEFT JOIN tipos_equipo t ON e.tipo = t.id
      LEFT JOIN estados_equipo s ON e.estado = s.id
      WHERE e.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Equipo no encontrado' });
    }
    
    res.json({ ok: true, equipo: rows[0] });
  } catch (err) {
    console.error('❌ Error obtenerEquipoPorId:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener equipo' });
  }
}

// Crear equipo
async function crearEquipo(req, res) {
  try {
    const { 
      cliente_id, tipo, marca, modelo, mac, ip, serie, 
      estado, fecha_instalacion, notas, nombre_red, contrasena_red 
    } = req.body;
    
    if (!cliente_id) {
      return res.status(400).json({ ok: false, mensaje: 'Cliente es requerido' });
    }

    const pool = obtenerPool();
    const id = generarUUID();
    
    await pool.query(
      `INSERT INTO equipos (id, cliente_id, tipo, marca, modelo, mac, ip, serie, estado, fecha_instalacion, notas, nombre_red, contrasena_red) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, cliente_id, tipo, marca, modelo, mac, ip, serie, estado, fecha_instalacion || null, notas, nombre_red, contrasena_red]
    );

    res.json({ ok: true, mensaje: 'Equipo creado', equipo: { id } });
  } catch (err) {
    console.error('❌ Error crearEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear equipo' });
  }
}

// Actualizar equipo
async function actualizarEquipo(req, res) {
  try {
    const { id } = req.params;
    const { 
      tipo, marca, modelo, mac, ip, serie, 
      estado, fecha_instalacion, notas, nombre_red, contrasena_red 
    } = req.body;
    
    const pool = obtenerPool();
    
    const [existe] = await pool.query('SELECT id FROM equipos WHERE id = ?', [id]);
    if (existe.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Equipo no encontrado' });
    }
    
    await pool.query(
      `UPDATE equipos SET 
        tipo = ?, marca = ?, modelo = ?, mac = ?, ip = ?, serie = ?,
        estado = ?, fecha_instalacion = ?, notas = ?, nombre_red = ?, contrasena_red = ?
       WHERE id = ?`,
      [tipo, marca, modelo, mac, ip, serie, estado, fecha_instalacion || null, notas, nombre_red, contrasena_red, id]
    );

    res.json({ ok: true, mensaje: 'Equipo actualizado' });
  } catch (err) {
    console.error('❌ Error actualizarEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar equipo' });
  }
}

// Eliminar equipo
async function eliminarEquipo(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();
    
    const [existe] = await pool.query('SELECT id FROM equipos WHERE id = ?', [id]);
    if (existe.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Equipo no encontrado' });
    }
    
    await pool.query('DELETE FROM equipos WHERE id = ?', [id]);
    res.json({ ok: true, mensaje: 'Equipo eliminado' });
  } catch (err) {
    console.error('❌ Error eliminarEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar equipo' });
  }
}

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = { 
  // Catálogos
  obtenerTiposEquipo,
  crearTipoEquipo,
  actualizarTipoEquipo,
  eliminarTipoEquipo,
  obtenerEstadosEquipo,
  crearEstadoEquipo,
  actualizarEstadoEquipo,
  eliminarEstadoEquipo,
  // Equipos
  obtenerEquipos, 
  obtenerEquipoPorId,
  crearEquipo, 
  actualizarEquipo,
  eliminarEquipo 
};

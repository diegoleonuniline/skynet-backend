const { obtenerPool } = require('../configuracion/base_datos');

// Obtener todos los equipos (opcionalmente filtrado por cliente)
async function obtenerEquipos(req, res) {
  try {
    const { cliente_id } = req.query;
    const pool = obtenerPool();
    
    let query = `SELECT * FROM equipos WHERE 1=1`;
    const params = [];
    
    if (cliente_id) {
      query += ` AND cliente_id = ?`;
      params.push(cliente_id);
    }
    
    query += ` ORDER BY creado_en DESC`;
    
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
    
    const [rows] = await pool.query('SELECT * FROM equipos WHERE id = ?', [id]);
    
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
      cliente_id, tipo, marca, modelo, mac, ip, serial, 
      estado, fecha_instalacion, notas, nombre_red, contrasena_red 
    } = req.body;
    
    if (!cliente_id) {
      return res.status(400).json({ ok: false, mensaje: 'Cliente es requerido' });
    }

    const pool = obtenerPool();
    const id = generarUUID();
    
    await pool.query(
      `INSERT INTO equipos (id, cliente_id, tipo, marca, modelo, mac, ip, serial, estado, fecha_instalacion, notas, nombre_red, contrasena_red) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, cliente_id, tipo || 'router', marca, modelo, mac, ip, serial, estado || 'activo', fecha_instalacion, notas, nombre_red, contrasena_red]
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
      tipo, marca, modelo, mac, ip, serial, 
      estado, fecha_instalacion, notas, nombre_red, contrasena_red 
    } = req.body;
    
    const pool = obtenerPool();
    
    // Verificar que existe
    const [existe] = await pool.query('SELECT id FROM equipos WHERE id = ?', [id]);
    if (existe.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Equipo no encontrado' });
    }
    
    await pool.query(
      `UPDATE equipos SET 
        tipo = ?, marca = ?, modelo = ?, mac = ?, ip = ?, serial = ?,
        estado = ?, fecha_instalacion = ?, notas = ?, nombre_red = ?, contrasena_red = ?,
        actualizado_en = NOW()
       WHERE id = ?`,
      [tipo, marca, modelo, mac, ip, serial, estado, fecha_instalacion, notas, nombre_red, contrasena_red, id]
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
    
    // Verificar que existe
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
  obtenerEquipos, 
  obtenerEquipoPorId,
  crearEquipo, 
  actualizarEquipo,
  eliminarEquipo 
};

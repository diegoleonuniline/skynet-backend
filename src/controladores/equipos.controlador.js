const { obtenerPool } = require('../configuracion/base_datos');

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

async function crearEquipo(req, res) {
  try {
    const { cliente_id, tipo, marca, modelo, mac, ip, serial, nombre_red, contrasena_red } = req.body;
    
    if (!cliente_id) {
      return res.status(400).json({ ok: false, mensaje: 'Cliente es requerido' });
    }

    const pool = obtenerPool();
    const id = generarUUID();
    
    await pool.query(
      `INSERT INTO equipos (id, cliente_id, tipo, marca, modelo, mac, ip, serial, nombre_red, contrasena_red) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, cliente_id, tipo || 'router', marca, modelo, mac, ip, serial, nombre_red, contrasena_red]
    );

    res.json({ ok: true, mensaje: 'Equipo creado', equipo: { id } });
  } catch (err) {
    console.error('❌ Error crearEquipo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear equipo' });
  }
}

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = { obtenerEquipos, crearEquipo };

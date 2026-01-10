const { obtenerPool } = require('../configuracion/base_datos');

// Obtener equipos de un cliente
async function obtenerEquipos(req, res) {
  try {
    const { cliente_id } = req.query;
    const pool = obtenerPool();
    
    let sql = 'SELECT * FROM equipos WHERE 1=1';
    const params = [];
    
    if (cliente_id) {
      sql += ' AND cliente_id = ?';
      params.push(cliente_id);
    }
    
    sql += ' ORDER BY creado_en DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, equipos: rows });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener equipos' });
  }
}

// Obtener tipos de equipo (hardcoded por ahora)
async function obtenerTipos(req, res) {
  res.json({ 
    ok: true, 
    tipos: [
      { id: 'antena', nombre: 'Antena' },
      { id: 'router', nombre: 'Router' },
      { id: 'ont', nombre: 'ONT' },
      { id: 'switch', nombre: 'Switch' },
      { id: 'otro', nombre: 'Otro' }
    ]
  });
}

// Obtener estados de equipo (hardcoded por ahora)
async function obtenerEstados(req, res) {
  res.json({ 
    ok: true, 
    estados: [
      { id: 'instalado', nombre: 'Instalado' },
      { id: 'disponible', nombre: 'Disponible' },
      { id: 'dañado', nombre: 'Dañado' },
      { id: 'devuelto', nombre: 'Devuelto' },
      { id: 'perdido', nombre: 'Perdido' }
    ]
  });
}

// Crear equipo
async function crearEquipo(req, res) {
  try {
    const {
      cliente_id, tipo, marca, modelo, mac, ip,
      ssid, nombre_red, contrasena_red, serie, estado,
      fecha_instalacion, notas
    } = req.body;

    const pool = obtenerPool();
    
    await pool.query(
      `INSERT INTO equipos (
        cliente_id, tipo, marca, modelo, mac, ip,
        ssid, nombre_red, contrasena_red, serie, estado,
        fecha_instalacion, notas
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente_id || null, tipo || null, marca || null, modelo || null,
        mac || null, ip || null, ssid || null, nombre_red || null,
        contrasena_red || null, serie || null, estado || 'disponible',
        fecha_instalacion || null, notas || null
      ]
    );

    res.json({ ok: true, mensaje: 'Equipo registrado' });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear equipo' });
  }
}

// Actualizar equipo
async function actualizarEquipo(req, res) {
  try {
    const { id } = req.params;
    const {
      cliente_id, tipo, marca, modelo, mac, ip,
      ssid, nombre_red, contrasena_red, serie, estado,
      fecha_instalacion, notas
    } = req.body;

    const pool = obtenerPool();
    
    await pool.query(
      `UPDATE equipos SET
        cliente_id = ?, tipo = ?, marca = ?, modelo = ?, mac = ?, ip = ?,
        ssid = ?, nombre_red = ?, contrasena_red = ?, serie = ?, estado = ?,
        fecha_instalacion = ?, notas = ?
       WHERE id = ?`,
      [
        cliente_id || null, tipo || null, marca || null, modelo || null,
        mac || null, ip || null, ssid || null, nombre_red || null,
        contrasena_red || null, serie || null, estado || 'disponible',
        fecha_instalacion || null, notas || null, id
      ]
    );

    res.json({ ok: true, mensaje: 'Equipo actualizado' });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar equipo' });
  }
}

// Eliminar equipo
async function eliminarEquipo(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();
    await pool.query('DELETE FROM equipos WHERE id = ?', [id]);
    res.json({ ok: true, mensaje: 'Equipo eliminado' });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar equipo' });
  }
}

module.exports = {
  obtenerEquipos,
  obtenerTipos,
  obtenerEstados,
  crearEquipo,
  actualizarEquipo,
  eliminarEquipo
};

const { obtenerPool } = require('../configuracion/base_datos');

// ========================================
// CIUDADES
// ========================================
async function obtenerCiudades(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query('SELECT * FROM catalogo_ciudades WHERE activo = 1 ORDER BY nombre');
    res.json({ ok: true, ciudades: rows });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener ciudades' });
  }
}

async function crearCiudad(req, res) {
  try {
    const { nombre, estado_republica } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Nombre requerido' });
    
    const pool = obtenerPool();
    const id = generarUUID();
    await pool.query(
      'INSERT INTO catalogo_ciudades (id, nombre, estado_republica) VALUES (?, ?, ?)',
      [id, nombre, estado_republica || null]
    );
    res.json({ ok: true, mensaje: 'Ciudad creada', ciudad: { id, nombre } });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear ciudad' });
  }
}

// ========================================
// COLONIAS
// ========================================
async function obtenerColonias(req, res) {
  try {
    const { ciudad_id } = req.query;
    const pool = obtenerPool();
    
    let sql = 'SELECT * FROM catalogo_colonias WHERE activo = 1';
    const params = [];
    
    if (ciudad_id) {
      sql += ' AND ciudad_id = ?';
      params.push(ciudad_id);
    }
    
    sql += ' ORDER BY nombre';
    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, colonias: rows });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener colonias' });
  }
}

async function crearColonia(req, res) {
  try {
    const { ciudad_id, nombre, codigo_postal } = req.body;
    if (!ciudad_id || !nombre) return res.status(400).json({ ok: false, mensaje: 'Ciudad y nombre requeridos' });
    
    const pool = obtenerPool();
    const id = generarUUID();
    await pool.query(
      'INSERT INTO catalogo_colonias (id, ciudad_id, nombre, codigo_postal) VALUES (?, ?, ?, ?)',
      [id, ciudad_id, nombre, codigo_postal || null]
    );
    res.json({ ok: true, mensaje: 'Colonia creada', colonia: { id, nombre } });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear colonia' });
  }
}

// ========================================
// PLANES
// ========================================
async function obtenerPlanes(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query('SELECT * FROM catalogo_planes WHERE activo = 1 ORDER BY precio_mensual');
    res.json({ ok: true, planes: rows });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener planes' });
  }
}

async function crearPlan(req, res) {
  try {
    const { nombre, velocidad_mbps, precio_mensual, precio_instalacion, descripcion } = req.body;
    if (!nombre || !velocidad_mbps || !precio_mensual) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre, velocidad y precio requeridos' });
    }
    
    const pool = obtenerPool();
    const id = generarUUID();
    await pool.query(
      'INSERT INTO catalogo_planes (id, nombre, velocidad_mbps, precio_mensual, precio_instalacion, descripcion) VALUES (?, ?, ?, ?, ?, ?)',
      [id, nombre, velocidad_mbps, precio_mensual, precio_instalacion || 0, descripcion || null]
    );
    res.json({ ok: true, mensaje: 'Plan creado', plan: { id, nombre, precio_mensual } });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear plan' });
  }
}

// ========================================
// TIPOS DE EQUIPO
// ========================================
async function obtenerTiposEquipo(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query('SELECT * FROM catalogo_tipos_equipo WHERE activo = 1 ORDER BY nombre');
    res.json({ ok: true, tipos: rows });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener tipos de equipo' });
  }
}

// ========================================
// ESTADOS DE EQUIPO
// ========================================
async function obtenerEstadosEquipo(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query('SELECT * FROM catalogo_estados_equipo WHERE activo = 1 ORDER BY nombre');
    res.json({ ok: true, estados: rows });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener estados de equipo' });
  }
}

// Helper
function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  obtenerCiudades,
  crearCiudad,
  obtenerColonias,
  crearColonia,
  obtenerPlanes,
  crearPlan,
  obtenerTiposEquipo,
  obtenerEstadosEquipo
};

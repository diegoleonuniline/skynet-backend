const { obtenerPool } = require('../configuracion/base_datos');

// CIUDADES
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
    const [result] = await pool.query(
      'INSERT INTO catalogo_ciudades (nombre, estado_republica) VALUES (?, ?)',
      [nombre, estado_republica || null]
    );
    res.json({ ok: true, mensaje: 'Ciudad creada' });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear ciudad' });
  }
}

// COLONIAS
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
    await pool.query(
      'INSERT INTO catalogo_colonias (ciudad_id, nombre, codigo_postal) VALUES (?, ?, ?)',
      [ciudad_id, nombre, codigo_postal || null]
    );
    res.json({ ok: true, mensaje: 'Colonia creada' });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear colonia' });
  }
}

// PLANES
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
    await pool.query(
      'INSERT INTO catalogo_planes (nombre, velocidad_mbps, precio_mensual, precio_instalacion, descripcion) VALUES (?, ?, ?, ?, ?)',
      [nombre, velocidad_mbps, precio_mensual, precio_instalacion || 0, descripcion || null]
    );
    res.json({ ok: true, mensaje: 'Plan creado' });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear plan' });
  }
}

module.exports = {
  obtenerCiudades,
  crearCiudad,
  obtenerColonias,
  crearColonia,
  obtenerPlanes,
  crearPlan
};

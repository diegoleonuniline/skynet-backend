const { obtenerPool } = require('../configuracion/base_datos');

// ========================================
// CIUDADES
// ========================================

async function obtenerCiudades(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query(
      `SELECT id, nombre, estado_republica FROM catalogo_ciudades WHERE activo = 1 ORDER BY nombre`
    );
    res.json({ ok: true, ciudades: rows });
  } catch (err) {
    console.error('❌ Error obtenerCiudades:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener ciudades' });
  }
}

async function crearCiudad(req, res) {
  try {
    const { nombre, estado_republica } = req.body;
    if (!nombre) {
      return res.status(400).json({ ok: false, mensaje: 'El nombre es requerido' });
    }

    const pool = obtenerPool();
    const id = generarUUID();
    
    await pool.query(
      `INSERT INTO catalogo_ciudades (id, nombre, estado_republica) VALUES (?, ?, ?)`,
      [id, nombre, estado_republica || null]
    );

    res.json({ ok: true, mensaje: 'Ciudad creada', ciudad: { id, nombre, estado_republica } });
  } catch (err) {
    console.error('❌ Error crearCiudad:', err.message);
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
    
    let query = `SELECT id, nombre, ciudad_id, codigo_postal FROM catalogo_colonias WHERE activo = 1`;
    const params = [];
    
    if (ciudad_id) {
      query += ` AND ciudad_id = ?`;
      params.push(ciudad_id);
    }
    
    query += ` ORDER BY nombre`;
    
    const [rows] = await pool.query(query, params);
    res.json({ ok: true, colonias: rows });
  } catch (err) {
    console.error('❌ Error obtenerColonias:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener colonias' });
  }
}

async function crearColonia(req, res) {
  try {
    const { nombre, ciudad_id, codigo_postal } = req.body;
    if (!nombre || !ciudad_id) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre y ciudad son requeridos' });
    }

    const pool = obtenerPool();
    const id = generarUUID();
    
    await pool.query(
      `INSERT INTO catalogo_colonias (id, nombre, ciudad_id, codigo_postal) VALUES (?, ?, ?, ?)`,
      [id, nombre, ciudad_id, codigo_postal || null]
    );

    res.json({ ok: true, mensaje: 'Colonia creada', colonia: { id, nombre, ciudad_id, codigo_postal } });
  } catch (err) {
    console.error('❌ Error crearColonia:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear colonia' });
  }
}

// ========================================
// PLANES
// ========================================

async function obtenerPlanes(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query(
      `SELECT id, nombre, velocidad_mbps, precio_mensual, precio_instalacion, descripcion 
       FROM catalogo_planes WHERE activo = 1 ORDER BY precio_mensual`
    );
    res.json({ ok: true, planes: rows });
  } catch (err) {
    console.error('❌ Error obtenerPlanes:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener planes' });
  }
}

async function crearPlan(req, res) {
  try {
    const { nombre, velocidad_mbps, precio_mensual, precio_instalacion, descripcion } = req.body;
    if (!nombre || !velocidad_mbps || !precio_mensual) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre, velocidad y precio son requeridos' });
    }

    const pool = obtenerPool();
    const id = generarUUID();
    
    await pool.query(
      `INSERT INTO catalogo_planes (id, nombre, velocidad_mbps, precio_mensual, precio_instalacion, descripcion) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, nombre, velocidad_mbps, precio_mensual, precio_instalacion || 0, descripcion || null]
    );

    res.json({ 
      ok: true, 
      mensaje: 'Plan creado', 
      plan: { id, nombre, velocidad_mbps, precio_mensual, precio_instalacion, descripcion } 
    });
  } catch (err) {
    console.error('❌ Error crearPlan:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear plan' });
  }
}

// Generar UUID
function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  obtenerCiudades,
  crearCiudad,
  obtenerColonias,
  crearColonia,
  obtenerPlanes,
  crearPlan
};

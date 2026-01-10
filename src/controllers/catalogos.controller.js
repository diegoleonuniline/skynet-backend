const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Catálogos reales: catalogo_roles, catalogo_ciudades, catalogo_colonias, catalogo_tipos_cargo, catalogo_tipos_equipo, catalogo_metodos_pago, catalogo_bancos

const TABLAS = {
  roles: 'catalogo_roles',
  ciudades: 'catalogo_ciudades',
  colonias: 'catalogo_colonias',
  tipos_cargo: 'catalogo_tipos_cargo',
  tipos_equipo: 'catalogo_tipos_equipo',
  tipos_pago: 'catalogo_metodos_pago',
  metodos_pago: 'catalogo_metodos_pago',
  bancos: 'catalogo_bancos'
};

// Estados fijos (no hay tablas)
const ESTADOS = {
  estados_cliente: [{ id: '1', nombre: 'Activo' }, { id: '0', nombre: 'Inactivo' }],
  estados_usuario: [{ id: '1', nombre: 'Activo' }, { id: '0', nombre: 'Inactivo' }],
  estados_servicio: [{ id: '1', nombre: 'Activo' }, { id: '0', nombre: 'Inactivo' }]
};

const listar = async (req, res) => {
  try {
    const { catalogo } = req.params;
    const { ciudad_id } = req.query;
    
    if (ESTADOS[catalogo]) return res.json({ success: true, data: ESTADOS[catalogo] });
    
    const tabla = TABLAS[catalogo];
    if (!tabla) return res.status(400).json({ success: false, message: 'Catálogo no válido' });
    
    let query = `SELECT * FROM ${tabla} WHERE activo = 1`;
    const params = [];
    
    if (catalogo === 'colonias' && ciudad_id) { query += ` AND ciudad_id = ?`; params.push(ciudad_id); }
    query += ` ORDER BY nombre`;
    
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const crear = async (req, res) => {
  try {
    const { catalogo } = req.params;
    const { nombre, descripcion, ciudad_id } = req.body;
    
    if (ESTADOS[catalogo]) return res.status(400).json({ success: false, message: 'No modificable' });
    
    const tabla = TABLAS[catalogo];
    if (!tabla || !nombre) return res.status(400).json({ success: false, message: 'Datos inválidos' });
    
    const id = uuidv4();
    
    if (catalogo === 'colonias') {
      if (!ciudad_id) return res.status(400).json({ success: false, message: 'Ciudad requerida' });
      await pool.query(`INSERT INTO ${tabla} (id, nombre, ciudad_id, activo) VALUES (?, ?, ?, 1)`, [id, nombre, ciudad_id]);
    } else if (catalogo === 'roles') {
      await pool.query(`INSERT INTO ${tabla} (id, nombre, descripcion, activo) VALUES (?, ?, ?, 1)`, [id, nombre, descripcion || null]);
    } else {
      await pool.query(`INSERT INTO ${tabla} (id, nombre, activo) VALUES (?, ?, 1)`, [id, nombre]);
    }
    
    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

module.exports = { listar, crear };

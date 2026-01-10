const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Mapeo de nombres de catálogos a tablas
const CATALOGOS = {
  roles: 'catalogo_roles',
  ciudades: 'catalogo_ciudades',
  colonias: 'catalogo_colonias',
  tipos_pago: 'catalogo_metodos_pago',
  tipos_cargo: 'catalogo_tipos_cargo',
  tipos_equipo: 'catalogo_tipos_equipo',
  tarifas: 'catalogo_tarifas',
  bancos: 'catalogo_bancos',
  // Estados - si no existen tablas, usamos valores fijos
  estados_cliente: null,
  estados_usuario: null,
  estados_servicio: null,
  estados_instalacion: null
};

// Estados fijos (ya que no hay tablas de estados)
const ESTADOS_FIJOS = {
  estados_cliente: [
    { id: '1', nombre: 'Activo' },
    { id: '2', nombre: 'Suspendido' },
    { id: '3', nombre: 'Cancelado' }
  ],
  estados_usuario: [
    { id: '1', nombre: 'Activo' },
    { id: '2', nombre: 'Inactivo' }
  ],
  estados_servicio: [
    { id: '1', nombre: 'Activo' },
    { id: '2', nombre: 'Suspendido' },
    { id: '3', nombre: 'Cancelado' }
  ],
  estados_instalacion: [
    { id: '1', nombre: 'Programada' },
    { id: '2', nombre: 'Completada' },
    { id: '3', nombre: 'Cancelada' }
  ]
};

const listar = async (req, res) => {
  try {
    const { catalogo } = req.params;
    const { ciudad_id } = req.query;
    
    // Si es un estado fijo
    if (ESTADOS_FIJOS[catalogo]) {
      return res.json({ success: true, data: ESTADOS_FIJOS[catalogo] });
    }
    
    const tabla = CATALOGOS[catalogo];
    if (!tabla) {
      return res.status(400).json({ success: false, message: 'Catálogo no válido' });
    }
    
    let query = `SELECT * FROM ${tabla} WHERE activo = 1`;
    const params = [];
    
    if (catalogo === 'colonias' && ciudad_id) {
      query += ` AND ciudad_id = ?`;
      params.push(ciudad_id);
    }
    
    query += ` ORDER BY nombre`;
    
    const [rows] = await pool.query(query, params);
    
    // Para tarifas, agregar campos adicionales
    if (catalogo === 'tarifas') {
      for (let row of rows) {
        row.precio_mensual = row.precio;
      }
    }
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error listando catálogo:', error);
    res.status(500).json({ success: false, message: 'Error al listar catálogo' });
  }
};

const crear = async (req, res) => {
  try {
    const { catalogo } = req.params;
    const { nombre, descripcion, ciudad_id, precio, velocidad_mbps } = req.body;
    
    if (ESTADOS_FIJOS[catalogo]) {
      return res.status(400).json({ success: false, message: 'No se puede modificar este catálogo' });
    }
    
    const tabla = CATALOGOS[catalogo];
    if (!tabla) {
      return res.status(400).json({ success: false, message: 'Catálogo no válido' });
    }
    
    if (!nombre) {
      return res.status(400).json({ success: false, message: 'El nombre es requerido' });
    }
    
    const id = uuidv4();
    
    if (catalogo === 'colonias') {
      if (!ciudad_id) {
        return res.status(400).json({ success: false, message: 'La ciudad es requerida' });
      }
      await pool.query(
        `INSERT INTO ${tabla} (id, nombre, ciudad_id, activo) VALUES (?, ?, ?, 1)`,
        [id, nombre, ciudad_id]
      );
    } else if (catalogo === 'tarifas') {
      await pool.query(
        `INSERT INTO ${tabla} (id, nombre, precio, velocidad_mbps, activo) VALUES (?, ?, ?, ?, 1)`,
        [id, nombre, precio || 0, velocidad_mbps || 0]
      );
    } else {
      await pool.query(
        `INSERT INTO ${tabla} (id, nombre, descripcion, activo) VALUES (?, ?, ?, 1)`,
        [id, nombre, descripcion || null]
      );
    }
    
    res.status(201).json({ success: true, message: 'Registro creado', data: { id } });
  } catch (error) {
    console.error('Error creando en catálogo:', error);
    res.status(500).json({ success: false, message: 'Error al crear registro' });
  }
};

module.exports = { listar, crear };

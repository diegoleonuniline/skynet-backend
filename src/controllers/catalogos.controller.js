const pool = require('../config/database');

// Mapeo de catálogos disponibles
const CATALOGOS = {
  roles: 'cat_roles',
  estados_usuario: 'cat_estados_usuario',
  estados_cliente: 'cat_estados_cliente',
  estados_servicio: 'cat_estados_servicio',
  estados_instalacion: 'cat_estados_instalacion',
  estados_cargo: 'cat_estados_cargo',
  estados_pago: 'cat_estados_pago',
  tipos_cargo: 'cat_tipos_cargo',
  tipos_pago: 'cat_tipos_pago',
  ciudades: 'cat_ciudades',
  colonias: 'cat_colonias',
  tarifas: 'cat_tarifas'
};

// Listar todos los catálogos disponibles
const catalogosDisponibles = async (req, res) => {
  res.json({
    success: true,
    data: Object.keys(CATALOGOS)
  });
};

// Obtener items de un catálogo
const obtenerCatalogo = async (req, res) => {
  try {
    const { catalogo } = req.params;
    const { activos_solo = 'true', ciudad_id } = req.query;
    
    const tabla = CATALOGOS[catalogo];
    
    if (!tabla) {
      return res.status(404).json({
        success: false,
        message: 'Catálogo no encontrado'
      });
    }
    
    let query = `SELECT * FROM ${tabla}`;
    const params = [];
    
    if (activos_solo === 'true') {
      query += ` WHERE activo = 1`;
    }
    
    // Filtro especial para colonias por ciudad
    if (catalogo === 'colonias' && ciudad_id) {
      query += activos_solo === 'true' ? ' AND' : ' WHERE';
      query += ` ciudad_id = ?`;
      params.push(ciudad_id);
    }
    
    query += ` ORDER BY nombre ASC`;
    
    const [items] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: items
    });
    
  } catch (error) {
    console.error('Error obteniendo catálogo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener catálogo'
    });
  }
};

// Agregar item a catálogo (solo admin)
const agregarItem = async (req, res) => {
  try {
    const { catalogo } = req.params;
    const datos = req.body;
    
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para modificar catálogos'
      });
    }
    
    const tabla = CATALOGOS[catalogo];
    
    if (!tabla) {
      return res.status(404).json({
        success: false,
        message: 'Catálogo no encontrado'
      });
    }
    
    // Campos base que todos los catálogos tienen
    const campos = ['nombre'];
    const valores = [datos.nombre];
    const placeholders = ['?'];
    
    // Campos adicionales según el catálogo
    if (datos.descripcion !== undefined) {
      campos.push('descripcion');
      valores.push(datos.descripcion);
      placeholders.push('?');
    }
    
    if (catalogo === 'colonias' && datos.ciudad_id) {
      campos.push('ciudad_id');
      valores.push(datos.ciudad_id);
      placeholders.push('?');
    }
    
    if (catalogo === 'tarifas') {
      if (datos.precio) {
        campos.push('precio');
        valores.push(datos.precio);
        placeholders.push('?');
      }
      if (datos.velocidad_mbps) {
        campos.push('velocidad_mbps');
        valores.push(datos.velocidad_mbps);
        placeholders.push('?');
      }
      campos.push('created_by');
      valores.push(req.userId);
      placeholders.push('?');
    }
    
    const [result] = await pool.query(
      `INSERT INTO ${tabla} (${campos.join(', ')}) VALUES (${placeholders.join(', ')})`,
      valores
    );
    
    res.status(201).json({
      success: true,
      message: 'Item agregado correctamente',
      data: {
        id: result.insertId
      }
    });
    
  } catch (error) {
    console.error('Error agregando item:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un item con ese nombre'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error al agregar item'
    });
  }
};

// Actualizar item de catálogo
const actualizarItem = async (req, res) => {
  try {
    const { catalogo, id } = req.params;
    const datos = req.body;
    
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para modificar catálogos'
      });
    }
    
    const tabla = CATALOGOS[catalogo];
    
    if (!tabla) {
      return res.status(404).json({
        success: false,
        message: 'Catálogo no encontrado'
      });
    }
    
    const updates = [];
    const valores = [];
    
    if (datos.nombre !== undefined) {
      updates.push('nombre = ?');
      valores.push(datos.nombre);
    }
    
    if (datos.descripcion !== undefined) {
      updates.push('descripcion = ?');
      valores.push(datos.descripcion);
    }
    
    if (datos.activo !== undefined) {
      updates.push('activo = ?');
      valores.push(datos.activo ? 1 : 0);
    }
    
    if (catalogo === 'tarifas') {
      if (datos.precio !== undefined) {
        updates.push('precio = ?');
        valores.push(datos.precio);
      }
      if (datos.velocidad_mbps !== undefined) {
        updates.push('velocidad_mbps = ?');
        valores.push(datos.velocidad_mbps);
      }
      updates.push('updated_by = ?');
      valores.push(req.userId);
    }
    
    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'No hay cambios que guardar'
      });
    }
    
    valores.push(id);
    
    await pool.query(
      `UPDATE ${tabla} SET ${updates.join(', ')} WHERE id = ?`,
      valores
    );
    
    res.json({
      success: true,
      message: 'Item actualizado correctamente'
    });
    
  } catch (error) {
    console.error('Error actualizando item:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar item'
    });
  }
};

// Desactivar item (borrado lógico)
const desactivarItem = async (req, res) => {
  try {
    const { catalogo, id } = req.params;
    
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para modificar catálogos'
      });
    }
    
    const tabla = CATALOGOS[catalogo];
    
    if (!tabla) {
      return res.status(404).json({
        success: false,
        message: 'Catálogo no encontrado'
      });
    }
    
    await pool.query(
      `UPDATE ${tabla} SET activo = 0 WHERE id = ?`,
      [id]
    );
    
    res.json({
      success: true,
      message: 'Item desactivado correctamente'
    });
    
  } catch (error) {
    console.error('Error desactivando item:', error);
    res.status(500).json({
      success: false,
      message: 'Error al desactivar item'
    });
  }
};

// Obtener todas las ciudades con sus colonias
const ciudadesConColonias = async (req, res) => {
  try {
    const [ciudades] = await pool.query(
      'SELECT * FROM cat_ciudades WHERE activo = 1 ORDER BY nombre'
    );
    
    for (const ciudad of ciudades) {
      const [colonias] = await pool.query(
        'SELECT * FROM cat_colonias WHERE ciudad_id = ? AND activo = 1 ORDER BY nombre',
        [ciudad.id]
      );
      ciudad.colonias = colonias;
    }
    
    res.json({
      success: true,
      data: ciudades
    });
    
  } catch (error) {
    console.error('Error obteniendo ciudades:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ciudades'
    });
  }
};

module.exports = {
  catalogosDisponibles,
  obtenerCatalogo,
  agregarItem,
  actualizarItem,
  desactivarItem,
  ciudadesConColonias
};

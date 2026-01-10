const pool = require('../config/database');
const cloudinary = require('../config/cloudinary');
const { registrarCreacion, registrarEdicion, registrarEliminacion, obtenerHistorial } = require('../services/historial.service');
const { obtenerResumenCliente } = require('../services/pagos.service');

// Generar número de cliente único
const generarNumeroCliente = async () => {
  const [ultimo] = await pool.query(
    `SELECT numero_cliente FROM clientes 
     WHERE numero_cliente IS NOT NULL 
     ORDER BY id DESC LIMIT 1`
  );
  
  let consecutivo = 1;
  if (ultimo.length > 0 && ultimo[0].numero_cliente) {
    const num = parseInt(ultimo[0].numero_cliente.replace('CLI', ''));
    consecutivo = num + 1;
  }
  
  return `CLI${String(consecutivo).padStart(6, '0')}`;
};

// Listar clientes con filtros
const listar = async (req, res) => {
  try {
    const { 
      busqueda, 
      estado_id, 
      colonia_id, 
      ciudad_id,
      page = 1, 
      limit = 20 
    } = req.query;
    
    let query = `
      SELECT c.*, 
             ec.nombre as estado,
             col.nombre as colonia,
             ciu.nombre as ciudad,
             (SELECT COALESCE(SUM(ca.saldo), 0) FROM cargos ca 
              JOIN servicios s ON ca.servicio_id = s.id 
              WHERE s.cliente_id = c.id AND ca.saldo > 0 AND ca.activo = 1) as adeudo
      FROM clientes c
      LEFT JOIN cat_estados_cliente ec ON c.estado_id = ec.id
      LEFT JOIN cat_colonias col ON c.colonia_id = col.id
      LEFT JOIN cat_ciudades ciu ON col.ciudad_id = ciu.id
      WHERE c.activo = 1
    `;
    
    const params = [];
    
    if (busqueda) {
      query += ` AND (c.nombre LIKE ? OR c.apellido_paterno LIKE ? OR c.numero_cliente LIKE ? OR c.telefono_principal LIKE ?)`;
      const term = `%${busqueda}%`;
      params.push(term, term, term, term);
    }
    
    if (estado_id) {
      query += ` AND c.estado_id = ?`;
      params.push(estado_id);
    }
    
    if (colonia_id) {
      query += ` AND c.colonia_id = ?`;
      params.push(colonia_id);
    }
    
    if (ciudad_id) {
      query += ` AND col.ciudad_id = ?`;
      params.push(ciudad_id);
    }
    
    // Contar total
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;
    
    // Paginación
    const offset = (page - 1) * limit;
    query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [clientes] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: clientes,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error listando clientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar clientes'
    });
  }
};

// Obtener cliente por ID
const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [clientes] = await pool.query(
      `SELECT c.*, 
              ec.nombre as estado,
              col.nombre as colonia,
              ciu.nombre as ciudad,
              ciu.id as ciudad_id
       FROM clientes c
       LEFT JOIN cat_estados_cliente ec ON c.estado_id = ec.id
       LEFT JOIN cat_colonias col ON c.colonia_id = col.id
       LEFT JOIN cat_ciudades ciu ON col.ciudad_id = ciu.id
       WHERE c.id = ? AND c.activo = 1`,
      [id]
    );
    
    if (clientes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }
    
    const cliente = clientes[0];
    
    // Obtener servicios del cliente
    const [servicios] = await pool.query(
      `SELECT s.*, t.nombre as tarifa_nombre, t.velocidad_mbps,
              es.nombre as estado
       FROM servicios s
       JOIN cat_tarifas t ON s.tarifa_id = t.id
       JOIN cat_estados_servicio es ON s.estado_id = es.id
       WHERE s.cliente_id = ? AND s.activo = 1`,
      [id]
    );
    
    // Obtener resumen financiero
    const resumen = await obtenerResumenCliente(id);
    
    res.json({
      success: true,
      data: {
        ...cliente,
        servicios,
        resumen_financiero: resumen
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener cliente'
    });
  }
};

// Crear cliente
const crear = async (req, res) => {
  try {
    const {
      nombre,
      apellido_paterno,
      apellido_materno,
      telefono_principal,
      telefono_secundario,
      email,
      calle,
      numero_exterior,
      numero_interior,
      colonia_id,
      codigo_postal,
      referencias,
      notas
    } = req.body;
    
    // Validaciones
    if (!nombre || !apellido_paterno || !telefono_principal) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, apellido paterno y teléfono son requeridos'
      });
    }
    
    // Obtener estado activo
    const [estados] = await pool.query(
      'SELECT id FROM cat_estados_cliente WHERE nombre = "Activo"'
    );
    
    const numero_cliente = await generarNumeroCliente();
    
    const [result] = await pool.query(
      `INSERT INTO clientes 
       (numero_cliente, nombre, apellido_paterno, apellido_materno, telefono_principal, 
        telefono_secundario, email, calle, numero_exterior, numero_interior, 
        colonia_id, codigo_postal, referencias, notas, estado_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [numero_cliente, nombre, apellido_paterno, apellido_materno, telefono_principal,
       telefono_secundario, email, calle, numero_exterior, numero_interior,
       colonia_id, codigo_postal, referencias, notas, estados[0].id, req.userId]
    );
    
    // Registrar en historial
    await registrarCreacion('clientes', result.insertId, req.userId, req.ip);
    
    res.status(201).json({
      success: true,
      message: 'Cliente creado correctamente',
      data: {
        id: result.insertId,
        numero_cliente
      }
    });
    
  } catch (error) {
    console.error('Error creando cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear cliente'
    });
  }
};

// Actualizar cliente
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    
    // Verificar permisos (solo admin puede editar)
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para editar clientes'
      });
    }
    
    // Obtener datos actuales para historial
    const [actual] = await pool.query(
      'SELECT * FROM clientes WHERE id = ? AND activo = 1',
      [id]
    );
    
    if (actual.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }
    
    // Campos permitidos para actualizar
    const permitidos = [
      'nombre', 'apellido_paterno', 'apellido_materno', 'telefono_principal',
      'telefono_secundario', 'email', 'calle', 'numero_exterior', 'numero_interior',
      'colonia_id', 'codigo_postal', 'referencias', 'notas', 'estado_id'
    ];
    
    const updates = [];
    const values = [];
    const cambios = {};
    
    for (const campo of permitidos) {
      if (campos[campo] !== undefined && campos[campo] !== actual[0][campo]) {
        updates.push(`${campo} = ?`);
        values.push(campos[campo]);
        cambios[campo] = {
          anterior: actual[0][campo],
          nuevo: campos[campo]
        };
      }
    }
    
    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'No hay cambios que guardar'
      });
    }
    
    updates.push('updated_by = ?');
    values.push(req.userId);
    values.push(id);
    
    await pool.query(
      `UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    // Registrar cambios en historial
    await registrarEdicion('clientes', id, cambios, req.userId, req.ip);
    
    res.json({
      success: true,
      message: 'Cliente actualizado correctamente'
    });
    
  } catch (error) {
    console.error('Error actualizando cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar cliente'
    });
  }
};

// Eliminar cliente (borrado lógico)
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Solo admin puede eliminar
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para eliminar clientes'
      });
    }
    
    await pool.query(
      'UPDATE clientes SET activo = 0, updated_by = ? WHERE id = ?',
      [req.userId, id]
    );
    
    await registrarEliminacion('clientes', id, req.userId, req.ip);
    
    res.json({
      success: true,
      message: 'Cliente eliminado correctamente'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar cliente'
    });
  }
};

// Subir INE
const subirINE = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo } = req.body; // 'frente' o 'reverso'
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó archivo'
      });
    }
    
    // Subir a Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'skynet/ine',
          resource_type: 'image',
          public_id: `cliente_${id}_ine_${tipo}`
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });
    
    // Actualizar URL en cliente
    const campo = tipo === 'frente' ? 'ine_frente_url' : 'ine_reverso_url';
    
    await pool.query(
      `UPDATE clientes SET ${campo} = ?, updated_by = ? WHERE id = ?`,
      [result.secure_url, req.userId, id]
    );
    
    res.json({
      success: true,
      message: 'INE subida correctamente',
      data: {
        url: result.secure_url
      }
    });
    
  } catch (error) {
    console.error('Error subiendo INE:', error);
    res.status(500).json({
      success: false,
      message: 'Error al subir INE'
    });
  }
};

// Obtener historial de cambios
const historial = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Solo admin puede ver historial
    if (req.user.rol_nombre !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver el historial'
      });
    }
    
    const historial = await obtenerHistorial('clientes', id);
    
    res.json({
      success: true,
      data: historial
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener historial'
    });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  subirINE,
  historial
};

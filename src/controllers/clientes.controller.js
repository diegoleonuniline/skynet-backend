const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const listar = async (req, res) => {
  try {
    const { busqueda, estado_id, page = 1, limit = 15 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT c.*, col.nombre as colonia, ciu.nombre as ciudad
      FROM clientes c
      LEFT JOIN catalogo_colonias col ON c.colonia_id = col.id
      LEFT JOIN catalogo_ciudades ciu ON col.ciudad_id = ciu.id
      WHERE c.activo = 1
    `;
    const params = [];
    
    if (busqueda) {
      query += ` AND (c.nombre LIKE ? OR c.apellido_paterno LIKE ? OR c.numero_cliente LIKE ? OR c.telefono_principal LIKE ?)`;
      const searchTerm = `%${busqueda}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (estado_id) {
      query += ` AND c.estado_id = ?`;
      params.push(estado_id);
    }
    
    // Count total
    const countQuery = query.replace('SELECT c.*, col.nombre as colonia, ciu.nombre as ciudad', 'SELECT COUNT(*) as total');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;
    
    query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    const [clientes] = await pool.query(query, params);
    
    // Obtener adeudo de cada cliente
    for (let cliente of clientes) {
      const [adeudo] = await pool.query(
        `SELECT COALESCE(SUM(saldo), 0) as adeudo FROM cargos WHERE cliente_id = ? AND activo = 1`,
        [cliente.id]
      );
      cliente.adeudo = parseFloat(adeudo[0].adeudo) || 0;
      cliente.estado = cliente.activo ? 'Activo' : 'Inactivo';
    }
    
    res.json({
      success: true,
      data: clientes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error listando clientes:', error);
    res.status(500).json({ success: false, message: 'Error al listar clientes' });
  }
};

const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [clientes] = await pool.query(
      `SELECT c.*, col.nombre as colonia, ciu.nombre as ciudad
       FROM clientes c
       LEFT JOIN catalogo_colonias col ON c.colonia_id = col.id
       LEFT JOIN catalogo_ciudades ciu ON col.ciudad_id = ciu.id
       WHERE c.id = ?`,
      [id]
    );
    
    if (clientes.length === 0) {
      return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    }
    
    const cliente = clientes[0];
    cliente.estado = cliente.activo ? 'Activo' : 'Inactivo';
    
    // Obtener servicios
    const [servicios] = await pool.query(
      `SELECT s.*, t.nombre as tarifa_nombre, t.velocidad_mbps
       FROM servicios s
       LEFT JOIN catalogo_tarifas t ON s.tarifa_id = t.id
       WHERE s.cliente_id = ? AND s.activo = 1`,
      [id]
    );
    
    for (let servicio of servicios) {
      servicio.estado = servicio.activo ? 'Activo' : 'Inactivo';
    }
    
    cliente.servicios = servicios;
    
    // Resumen financiero
    const [resumen] = await pool.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN saldo > 0 THEN saldo ELSE 0 END), 0) as total_adeudo,
        COALESCE(SUM(CASE WHEN saldo < 0 THEN ABS(saldo) ELSE 0 END), 0) as saldo_favor
       FROM cargos WHERE cliente_id = ? AND activo = 1`,
      [id]
    );
    
    cliente.resumen_financiero = {
      balance: parseFloat(resumen[0].total_adeudo) - parseFloat(resumen[0].saldo_favor),
      total_adeudo: parseFloat(resumen[0].total_adeudo),
      saldo_favor: parseFloat(resumen[0].saldo_favor)
    };
    
    res.json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error obteniendo cliente:', error);
    res.status(500).json({ success: false, message: 'Error al obtener cliente' });
  }
};

const crear = async (req, res) => {
  try {
    const {
      nombre, apellido_paterno, apellido_materno,
      telefono_principal, telefono_secundario, email,
      calle, numero_exterior, numero_interior,
      colonia_id, codigo_postal, referencias, notas
    } = req.body;
    
    if (!nombre || !apellido_paterno || !telefono_principal) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, apellido paterno y teléfono son requeridos'
      });
    }
    
    const id = uuidv4();
    
    // Generar número de cliente
    const [lastClient] = await pool.query(
      'SELECT numero_cliente FROM clientes ORDER BY created_at DESC LIMIT 1'
    );
    let nextNum = 1;
    if (lastClient.length > 0 && lastClient[0].numero_cliente) {
      const match = lastClient[0].numero_cliente.match(/\d+/);
      if (match) nextNum = parseInt(match[0]) + 1;
    }
    const numero_cliente = `CLI-${String(nextNum).padStart(5, '0')}`;
    
    await pool.query(
      `INSERT INTO clientes (id, numero_cliente, nombre, apellido_paterno, apellido_materno,
        telefono_principal, telefono_secundario, email, calle, numero_exterior, numero_interior,
        colonia_id, codigo_postal, referencias, notas, activo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, numero_cliente, nombre, apellido_paterno, apellido_materno || null,
       telefono_principal, telefono_secundario || null, email || null,
       calle || null, numero_exterior || null, numero_interior || null,
       colonia_id || null, codigo_postal || null, referencias || null, notas || null,
       req.userId]
    );
    
    res.status(201).json({
      success: true,
      message: 'Cliente creado correctamente',
      data: { id, numero_cliente }
    });
  } catch (error) {
    console.error('Error creando cliente:', error);
    res.status(500).json({ success: false, message: 'Error al crear cliente' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    
    const camposPermitidos = [
      'nombre', 'apellido_paterno', 'apellido_materno',
      'telefono_principal', 'telefono_secundario', 'email',
      'calle', 'numero_exterior', 'numero_interior',
      'colonia_id', 'codigo_postal', 'referencias', 'notas', 'activo'
    ];
    
    const updates = [];
    const values = [];
    
    for (const campo of camposPermitidos) {
      if (campos[campo] !== undefined) {
        updates.push(`${campo} = ?`);
        values.push(campos[campo]);
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No hay campos para actualizar' });
    }
    
    updates.push('updated_by = ?');
    values.push(req.userId);
    values.push(id);
    
    await pool.query(
      `UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    res.json({ success: true, message: 'Cliente actualizado' });
  } catch (error) {
    console.error('Error actualizando cliente:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar cliente' });
  }
};

const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE clientes SET activo = 0, updated_by = ? WHERE id = ?',
      [req.userId, id]
    );
    
    res.json({ success: true, message: 'Cliente eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al eliminar cliente' });
  }
};

const subirINE = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió archivo' });
    }
    
    // Aquí iría la lógica de Cloudinary
    const url = `https://placeholder.com/ine_${id}_${tipo}.jpg`;
    
    const campo = tipo === 'frente' ? 'ine_frente_url' : 'ine_reverso_url';
    await pool.query(
      `UPDATE clientes SET ${campo} = ?, updated_by = ? WHERE id = ?`,
      [url, req.userId, id]
    );
    
    res.json({ success: true, message: 'INE subida correctamente', url });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al subir INE' });
  }
};

const historial = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [historial] = await pool.query(
      `SELECT h.*, u.nombre as usuario_nombre
       FROM historial_cambios h
       LEFT JOIN usuarios u ON h.usuario_id = u.id
       WHERE h.tabla_afectada = 'clientes' AND h.registro_id = ?
       ORDER BY h.created_at DESC`,
      [id]
    );
    
    res.json({ success: true, data: historial });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener historial' });
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

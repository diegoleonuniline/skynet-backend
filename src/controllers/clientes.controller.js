const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// clientes: id, nombre, apellido_paterno, apellido_materno, telefono_1, telefono_2, telefono_3,
// calle, numero, interior, colonia_id, ciudad_id, codigo_postal, identificacion_frente_url,
// identificacion_reverso_url, identificacion_enviada, estado_cliente, fecha_cancelacion, notas,
// created_at, created_by, updated_at, updated_by

const listar = async (req, res) => {
  try {
    const { busqueda, page = 1, limit = 15 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT c.*, col.nombre as colonia, ciu.nombre as ciudad
      FROM clientes c
      LEFT JOIN catalogo_colonias col ON c.colonia_id = col.id
      LEFT JOIN catalogo_ciudades ciu ON c.ciudad_id = ciu.id
      WHERE c.estado_cliente = 1
    `;
    const params = [];
    
    if (busqueda) {
      query += ` AND (c.nombre LIKE ? OR c.apellido_paterno LIKE ? OR c.telefono_1 LIKE ?)`;
      const t = `%${busqueda}%`;
      params.push(t, t, t);
    }
    
    const countQ = query.replace(/SELECT c\.\*, col\.nombre as colonia, ciu\.nombre as ciudad/, 'SELECT COUNT(*) as total');
    const [countR] = await pool.query(countQ, params);
    const total = countR[0].total;
    
    query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    const [clientes] = await pool.query(query, params);
    
    for (let c of clientes) {
      // Calcular adeudo
      const [cargosR] = await pool.query(
        `SELECT COALESCE(SUM(ca.monto), 0) as total FROM cargos ca
         JOIN servicios s ON ca.servicio_id = s.id WHERE s.cliente_id = ?`, [c.id]
      );
      const [pagosR] = await pool.query(
        `SELECT COALESCE(SUM(pd.monto_aplicado), 0) as total FROM pagos_detalle pd
         JOIN cargos ca ON pd.cargo_id = ca.id
         JOIN servicios s ON ca.servicio_id = s.id WHERE s.cliente_id = ?`, [c.id]
      );
      c.adeudo = parseFloat(cargosR[0].total) - parseFloat(pagosR[0].total);
      c.estado = c.estado_cliente ? 'Activo' : 'Inactivo';
      c.numero_cliente = c.id.substring(0, 8).toUpperCase();
      c.telefono_principal = c.telefono_1;
    }
    
    res.json({ success: true, data: clientes, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Error:', error);
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
       LEFT JOIN catalogo_ciudades ciu ON c.ciudad_id = ciu.id
       WHERE c.id = ?`, [id]
    );
    
    if (clientes.length === 0) return res.status(404).json({ success: false, message: 'No encontrado' });
    
    const c = clientes[0];
    c.estado = c.estado_cliente ? 'Activo' : 'Inactivo';
    c.numero_cliente = c.id.substring(0, 8).toUpperCase();
    c.telefono_principal = c.telefono_1;
    c.ine_frente_url = c.identificacion_frente_url;
    c.ine_reverso_url = c.identificacion_reverso_url;
    
    // Servicios
    const [servicios] = await pool.query(`SELECT * FROM servicios WHERE cliente_id = ? AND estado_servicio = 1`, [id]);
    for (let s of servicios) {
      s.estado = s.estado_servicio ? 'Activo' : 'Inactivo';
      s.precio_mensual = s.tarifa_mensual;
      s.tarifa_nombre = `Plan $${s.tarifa_mensual}`;
    }
    c.servicios = servicios;
    
    // Resumen
    const [cargosT] = await pool.query(
      `SELECT COALESCE(SUM(ca.monto), 0) as t FROM cargos ca JOIN servicios s ON ca.servicio_id = s.id WHERE s.cliente_id = ?`, [id]
    );
    const [pagosT] = await pool.query(
      `SELECT COALESCE(SUM(pd.monto_aplicado), 0) as t FROM pagos_detalle pd JOIN cargos ca ON pd.cargo_id = ca.id JOIN servicios s ON ca.servicio_id = s.id WHERE s.cliente_id = ?`, [id]
    );
    const balance = parseFloat(cargosT[0].t) - parseFloat(pagosT[0].t);
    c.resumen_financiero = { balance, total_adeudo: balance > 0 ? balance : 0, saldo_favor: balance < 0 ? Math.abs(balance) : 0 };
    
    res.json({ success: true, data: c });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const crear = async (req, res) => {
  try {
    const { nombre, apellido_paterno, apellido_materno, telefono_principal, telefono_secundario,
            calle, numero_exterior, numero_interior, colonia_id, ciudad_id, codigo_postal, notas } = req.body;
    
    if (!nombre || !apellido_paterno || !telefono_principal) {
      return res.status(400).json({ success: false, message: 'Nombre, apellido y teléfono requeridos' });
    }
    
    const id = uuidv4();
    await pool.query(
      `INSERT INTO clientes (id, nombre, apellido_paterno, apellido_materno, telefono_1, telefono_2,
        calle, numero, interior, colonia_id, ciudad_id, codigo_postal, notas, estado_cliente, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, nombre, apellido_paterno, apellido_materno || null, telefono_principal, telefono_secundario || null,
       calle || null, numero_exterior || null, numero_interior || null, colonia_id || null, ciudad_id || null,
       codigo_postal || null, notas || null, req.userId]
    );
    
    res.status(201).json({ success: true, message: 'Cliente creado', data: { id, numero_cliente: id.substring(0, 8).toUpperCase() } });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error al crear' });
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;
    
    const map = {
      nombre: 'nombre', apellido_paterno: 'apellido_paterno', apellido_materno: 'apellido_materno',
      telefono_principal: 'telefono_1', telefono_secundario: 'telefono_2', calle: 'calle',
      numero_exterior: 'numero', numero_interior: 'interior', colonia_id: 'colonia_id',
      ciudad_id: 'ciudad_id', codigo_postal: 'codigo_postal', notas: 'notas', estado_cliente: 'estado_cliente'
    };
    
    const updates = [], values = [];
    for (const [k, f] of Object.entries(map)) {
      if (b[k] !== undefined) { updates.push(`${f} = ?`); values.push(b[k]); }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, message: 'Nada que actualizar' });
    
    updates.push('updated_by = ?'); values.push(req.userId); values.push(id);
    await pool.query(`UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true, message: 'Actualizado' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE clientes SET estado_cliente = 0, fecha_cancelacion = CURDATE(), updated_by = ? WHERE id = ?', [req.userId, id]);
    res.json({ success: true, message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const subirINE = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'Sin archivo' });
    
    const url = `https://placeholder.com/ine_${id}_${tipo}.jpg`;
    const campo = tipo === 'frente' ? 'identificacion_frente_url' : 'identificacion_reverso_url';
    await pool.query(`UPDATE clientes SET ${campo} = ?, updated_by = ? WHERE id = ?`, [url, req.userId, id]);
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const historial = async (req, res) => {
  try {
    const { id } = req.params;
    const [h] = await pool.query(
      `SELECT h.*, u.nombre as usuario_nombre FROM historial_cambios h
       LEFT JOIN usuarios u ON h.usuario_id = u.id
       WHERE h.tabla_afectada = 'clientes' AND h.registro_id = ? ORDER BY h.fecha DESC`, [id]
    );
    res.json({ success: true, data: h });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar, subirINE, historial };

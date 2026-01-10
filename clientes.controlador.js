const { obtenerPool } = require('../configuracion/base_datos');

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function generarNumeroCliente(pool) {
  const [rows] = await pool.query('SELECT COUNT(*) as total FROM clientes');
  const num = (rows[0].total + 1).toString().padStart(4, '0');
  return `SKY-${num}`;
}

// ========================================
// REGISTRAR CAMBIO EN HISTORIAL
// ========================================
async function registrarCambio(pool, tabla, registroId, campo, valorAnterior, valorNuevo, usuarioId) {
  if (valorAnterior === valorNuevo) return;
  try {
    const id = generarUUID();
    await pool.query(
      'INSERT INTO historial_cambios (id, tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, tabla, registroId, campo, valorAnterior?.toString() || null, valorNuevo?.toString() || null, usuarioId || null]
    );
  } catch (err) {
    console.error('⚠️ Error al registrar historial:', err.message);
  }
}

// ========================================
// OBTENER CLIENTES (con paginación y filtros)
// ========================================
async function obtenerClientes(req, res) {
  try {
    const { pagina = 1, limite = 10, estado, busqueda, ciudad_id, colonia_id, plan_id } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);
    const pool = obtenerPool();

    let whereClause = '1=1';
    const params = [];

    if (estado && estado !== 'todos') {
      whereClause += ` AND c.estado = ?`;
      params.push(estado);
    }

    if (busqueda) {
      whereClause += ` AND (c.nombre LIKE ? OR c.apellido_paterno LIKE ? OR c.telefono LIKE ? OR c.numero_cliente LIKE ? OR c.direccion_calle LIKE ?)`;
      const busq = `%${busqueda}%`;
      params.push(busq, busq, busq, busq, busq);
    }

    if (ciudad_id) {
      whereClause += ` AND c.ciudad_id = ?`;
      params.push(ciudad_id);
    }

    if (colonia_id) {
      whereClause += ` AND c.colonia_id = ?`;
      params.push(colonia_id);
    }

    if (plan_id) {
      whereClause += ` AND c.plan_id = ?`;
      params.push(plan_id);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM clientes c WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [rows] = await pool.query(
      `SELECT c.*, 
              ci.nombre as ciudad_nombre,
              co.nombre as colonia_nombre,
              p.nombre as plan_nombre
       FROM clientes c
       LEFT JOIN catalogo_ciudades ci ON ci.id = c.ciudad_id
       LEFT JOIN catalogo_colonias co ON co.id = c.colonia_id
       LEFT JOIN catalogo_planes p ON p.id = c.plan_id
       WHERE ${whereClause}
       ORDER BY c.creado_en DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limite), offset]
    );

    res.json({
      ok: true,
      clientes: rows,
      total,
      paginaActual: parseInt(pagina),
      porPagina: parseInt(limite),
      totalPaginas: Math.ceil(total / parseInt(limite))
    });
  } catch (err) {
    console.error('❌ Error obtenerClientes:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener clientes' });
  }
}

// ========================================
// OBTENER UN CLIENTE
// ========================================
async function obtenerCliente(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();

    const [rows] = await pool.query(
      `SELECT c.*, 
              ci.nombre as ciudad_nombre,
              co.nombre as colonia_nombre,
              p.nombre as plan_nombre
       FROM clientes c
       LEFT JOIN catalogo_ciudades ci ON ci.id = c.ciudad_id
       LEFT JOIN catalogo_colonias co ON co.id = c.colonia_id
       LEFT JOIN catalogo_planes p ON p.id = c.plan_id
       WHERE c.id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    }

    res.json({ ok: true, cliente: rows[0] });
  } catch (err) {
    console.error('❌ Error obtenerCliente:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener cliente' });
  }
}

// ========================================
// CREAR CLIENTE (solo datos básicos)
// ========================================
async function crearCliente(req, res) {
  try {
    const {
      nombre, apellido_paterno, apellido_materno,
      telefono, telefono_secundario, telefono_terciario, email,
      ciudad_id, colonia_id, codigo_postal,
      direccion, direccion_calle, direccion_numero, direccion_interior,
      referencia, coordenadas_gps,
      plan_id,
      ine_frente, ine_reverso
    } = req.body;

    if (!nombre || !telefono) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre y teléfono son requeridos' });
    }

    const pool = obtenerPool();
    const id = generarUUID();
    const numero_cliente = await generarNumeroCliente(pool);

    await pool.query(`
      INSERT INTO clientes (
        id, numero_cliente, nombre, apellido_paterno, apellido_materno,
        telefono, telefono_secundario, telefono_terciario, email,
        ciudad_id, colonia_id, codigo_postal,
        direccion, direccion_calle, direccion_numero, direccion_interior,
        referencia, coordenadas_gps,
        plan_id,
        ine_frente, ine_reverso,
        creado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, numero_cliente, nombre, apellido_paterno || null, apellido_materno || null,
      telefono, telefono_secundario || null, telefono_terciario || null, email || null,
      ciudad_id || null, colonia_id || null, codigo_postal || null,
      direccion || null, direccion_calle || null, direccion_numero || null, direccion_interior || null,
      referencia || null, coordenadas_gps || null,
      plan_id || null,
      ine_frente || null, ine_reverso || null,
      req.usuario?.usuario_id || null
    ]);

    res.json({ 
      ok: true, 
      mensaje: 'Cliente creado', 
      cliente: { id, numero_cliente }
    });
  } catch (err) {
    console.error('❌ Error crearCliente:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear cliente' });
  }
}

// ========================================
// ACTUALIZAR CLIENTE (con historial de cambios)
// ========================================
async function actualizarCliente(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();
    const usuarioId = req.usuario?.usuario_id || null;

    // Obtener datos anteriores
    const [anterior] = await pool.query('SELECT * FROM clientes WHERE id = ?', [id]);
    if (!anterior.length) {
      return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    }
    const clienteAnterior = anterior[0];

    const {
      nombre, apellido_paterno, apellido_materno,
      telefono, telefono_secundario, telefono_terciario, email,
      ciudad_id, colonia_id, codigo_postal,
      direccion, direccion_calle, direccion_numero, direccion_interior,
      referencia, coordenadas_gps,
      plan_id,
      ine_frente, ine_reverso,
      estado
    } = req.body;

    // Campos a actualizar
    const camposActualizados = {
      nombre, apellido_paterno, apellido_materno,
      telefono, telefono_secundario, telefono_terciario, email,
      ciudad_id, colonia_id, codigo_postal,
      direccion, direccion_calle, direccion_numero, direccion_interior,
      referencia, coordenadas_gps,
      plan_id,
      ine_frente, ine_reverso,
      estado: estado || 'activo'
    };

    // Registrar cambios en historial
    for (const [campo, valorNuevo] of Object.entries(camposActualizados)) {
      if (valorNuevo !== undefined) {
        await registrarCambio(pool, 'clientes', id, campo, clienteAnterior[campo], valorNuevo, usuarioId);
      }
    }

    await pool.query(`
      UPDATE clientes SET 
        nombre = ?, apellido_paterno = ?, apellido_materno = ?,
        telefono = ?, telefono_secundario = ?, telefono_terciario = ?, email = ?,
        ciudad_id = ?, colonia_id = ?, codigo_postal = ?,
        direccion = ?, direccion_calle = ?, direccion_numero = ?, direccion_interior = ?,
        referencia = ?, coordenadas_gps = ?,
        plan_id = ?,
        ine_frente = ?, ine_reverso = ?,
        estado = ?
       WHERE id = ?`,
      [
        nombre, apellido_paterno, apellido_materno,
        telefono, telefono_secundario, telefono_terciario, email,
        ciudad_id, colonia_id, codigo_postal,
        direccion, direccion_calle, direccion_numero, direccion_interior,
        referencia, coordenadas_gps,
        plan_id,
        ine_frente, ine_reverso,
        estado || 'activo',
        id
      ]
    );

    res.json({ ok: true, mensaje: 'Cliente actualizado' });
  } catch (err) {
    console.error('❌ Error actualizarCliente:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar cliente' });
  }
}

// ========================================
// CANCELAR CLIENTE
// ========================================
async function cancelarCliente(req, res) {
  try {
    const { id } = req.params;
    const { motivo_cancelacion } = req.body;
    const pool = obtenerPool();

    await pool.query(
      `UPDATE clientes SET estado = 'cancelado', fecha_cancelacion = CURDATE(), motivo_cancelacion = ? WHERE id = ?`,
      [motivo_cancelacion || null, id]
    );

    // Registrar en historial
    await registrarCambio(pool, 'clientes', id, 'estado', 'activo', 'cancelado', req.usuario?.usuario_id);

    res.json({ ok: true, mensaje: 'Cliente cancelado' });
  } catch (err) {
    console.error('❌ Error cancelarCliente:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al cancelar cliente' });
  }
}

// ========================================
// OBTENER HISTORIAL DE CAMBIOS
// ========================================
async function obtenerHistorialCambios(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();

    const [rows] = await pool.query(`
      SELECT h.*, u.nombre_completo as usuario_nombre
      FROM historial_cambios h
      LEFT JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.registro_id = ?
      ORDER BY h.creado_en DESC
    `, [id]);

    res.json({ ok: true, historial: rows });
  } catch (err) {
    console.error('❌ Error obtenerHistorialCambios:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener historial' });
  }
}

// ========================================
// ESTADÍSTICAS
// ========================================
async function obtenerEstadisticas(req, res) {
  try {
    const pool = obtenerPool();
    
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN estado = 'activo' THEN 1 END) as activos,
        COUNT(CASE WHEN estado = 'cancelado' THEN 1 END) as cancelados,
        COUNT(CASE WHEN estado = 'suspendido' THEN 1 END) as suspendidos,
        COALESCE(SUM(CASE WHEN estado = 'activo' THEN COALESCE(tarifa_mensual, cuota_mensual) END), 0) as ingreso_potencial,
        COALESCE(SUM(saldo_pendiente), 0) as total_adeudo,
        COALESCE(SUM(saldo_favor), 0) as total_favor
      FROM clientes
    `);
    
    // Clientes por ciudad
    const [porCiudad] = await pool.query(`
      SELECT ci.nombre as ciudad, COUNT(c.id) as cantidad
      FROM clientes c
      LEFT JOIN catalogo_ciudades ci ON ci.id = c.ciudad_id
      WHERE c.estado = 'activo'
      GROUP BY c.ciudad_id
      ORDER BY cantidad DESC
    `);

    // Clientes por colonia
    const [porColonia] = await pool.query(`
      SELECT co.nombre as colonia, ci.nombre as ciudad, COUNT(c.id) as cantidad
      FROM clientes c
      LEFT JOIN catalogo_colonias co ON co.id = c.colonia_id
      LEFT JOIN catalogo_ciudades ci ON ci.id = c.ciudad_id
      WHERE c.estado = 'activo'
      GROUP BY c.colonia_id
      ORDER BY cantidad DESC
      LIMIT 20
    `);
    
    res.json({
      ok: true,
      estadisticas: {
        total: stats[0].total || 0,
        activos: stats[0].activos || 0,
        cancelados: stats[0].cancelados || 0,
        suspendidos: stats[0].suspendidos || 0,
        ingreso_potencial: parseFloat(stats[0].ingreso_potencial) || 0,
        total_adeudo: parseFloat(stats[0].total_adeudo) || 0,
        total_favor: parseFloat(stats[0].total_favor) || 0
      },
      por_ciudad: porCiudad,
      por_colonia: porColonia
    });
  } catch (err) {
    console.error('❌ Error obtenerEstadisticas:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener estadísticas' });
  }
}

module.exports = {
  obtenerClientes,
  obtenerCliente,
  crearCliente,
  actualizarCliente,
  cancelarCliente,
  obtenerHistorialCambios,
  obtenerEstadisticas
};

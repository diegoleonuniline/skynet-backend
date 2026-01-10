const { obtenerPool } = require('../configuracion/base_datos');

// Intentar importar cargos, pero no fallar si no existe
let generarCargosIniciales = null;
try {
  const cargosCtrl = require('./cargos.controlador');
  generarCargosIniciales = cargosCtrl.generarCargosIniciales;
} catch (e) {
  console.log('⚠️ Módulo de cargos no disponible aún');
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
      whereClause += ` AND (c.nombre LIKE ? OR c.apellido_paterno LIKE ? OR c.telefono LIKE ? OR c.numero_cliente LIKE ?)`;
      const busq = `%${busqueda}%`;
      params.push(busq, busq, busq, busq);
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

    // Contar total
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM clientes c WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Obtener clientes - compatible con ambas estructuras de tablas
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

    // Verificar si existe la tabla cargos
    let saldoQuery = '0 as saldo_pendiente';
    try {
      await pool.query('SELECT 1 FROM cargos LIMIT 1');
      saldoQuery = `COALESCE(
        (SELECT SUM(ca.saldo_pendiente) 
         FROM cargos ca 
         WHERE ca.cliente_id = c.id AND ca.estado IN ('pendiente','parcial')
        ), 0
      ) as saldo_pendiente`;
    } catch (e) {
      // Tabla cargos no existe aún
    }

    const [rows] = await pool.query(
      `SELECT c.*, 
              ci.nombre as ciudad_nombre,
              co.nombre as colonia_nombre,
              p.nombre as plan_nombre,
              ${saldoQuery}
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
// CREAR CLIENTE (con cargos automáticos si están disponibles)
// ========================================

async function crearCliente(req, res) {
  try {
    const {
      nombre, apellido_paterno, apellido_materno,
      telefono, telefono_secundario, email,
      ciudad_id, colonia_id, direccion, referencia,
      plan_id, tarifa_mensual, cuota_mensual, costo_instalacion,
      fecha_instalacion, dia_corte,
      tecnico_instalador, notas_instalacion
    } = req.body;

    if (!nombre || !telefono) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre y teléfono son requeridos' });
    }

    const pool = obtenerPool();
    const id = generarUUID();
    const numero_cliente = await generarNumeroCliente(pool);
    
    // Usar tarifa_mensual o cuota_mensual (compatibilidad)
    const tarifa = tarifa_mensual || cuota_mensual || 0;

    await pool.query(
      `INSERT INTO clientes (
        id, numero_cliente, nombre, apellido_paterno, apellido_materno,
        telefono, telefono_secundario, email,
        ciudad_id, colonia_id, direccion, referencia,
        plan_id, tarifa_mensual, fecha_instalacion,
        creado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, numero_cliente, nombre, apellido_paterno || null, apellido_materno || null,
        telefono, telefono_secundario || null, email || null,
        ciudad_id || null, colonia_id || null, direccion || null, referencia || null,
        plan_id || null, tarifa, fecha_instalacion || null,
        req.usuario?.usuario_id || null
      ]
    );

    // GENERAR CARGOS AUTOMÁTICOS si el módulo está disponible
    let cargosGenerados = [];
    if (generarCargosIniciales && fecha_instalacion && tarifa > 0) {
      try {
        cargosGenerados = await generarCargosIniciales(
          id,
          fecha_instalacion,
          parseFloat(tarifa),
          parseFloat(costo_instalacion) || 0
        );
      } catch (errCargos) {
        console.error('⚠️ Error al generar cargos iniciales:', errCargos.message);
      }
    }

    res.json({ 
      ok: true, 
      mensaje: 'Cliente creado', 
      cliente: { id, numero_cliente },
      cargos_generados: cargosGenerados
    });
  } catch (err) {
    console.error('❌ Error crearCliente:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear cliente' });
  }
}

// ========================================
// ACTUALIZAR CLIENTE
// ========================================

async function actualizarCliente(req, res) {
  try {
    const { id } = req.params;
    const {
      nombre, apellido_paterno, apellido_materno,
      telefono, telefono_secundario, email,
      ciudad_id, colonia_id, direccion, referencia,
      plan_id, tarifa_mensual, cuota_mensual, dia_corte, estado
    } = req.body;

    const pool = obtenerPool();

    // Verificar que existe
    const [existe] = await pool.query('SELECT id FROM clientes WHERE id = ?', [id]);
    if (!existe.length) {
      return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    }
    
    // Usar tarifa_mensual o cuota_mensual (compatibilidad)
    const tarifa = tarifa_mensual || cuota_mensual || 0;

    await pool.query(
      `UPDATE clientes SET
        nombre = ?, apellido_paterno = ?, apellido_materno = ?,
        telefono = ?, telefono_secundario = ?, email = ?,
        ciudad_id = ?, colonia_id = ?, direccion = ?, referencia = ?,
        plan_id = ?, tarifa_mensual = ?, estado = ?
       WHERE id = ?`,
      [
        nombre, apellido_paterno || null, apellido_materno || null,
        telefono, telefono_secundario || null, email || null,
        ciudad_id || null, colonia_id || null, direccion || null, referencia || null,
        plan_id || null, tarifa, estado || 'activo',
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
// ELIMINAR CLIENTE (soft delete)
// ========================================

async function eliminarCliente(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();

    await pool.query(
      `UPDATE clientes SET estado = 'cancelado', fecha_cancelacion = NOW() WHERE id = ?`,
      [id]
    );

    res.json({ ok: true, mensaje: 'Cliente cancelado' });
  } catch (err) {
    console.error('❌ Error eliminarCliente:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar cliente' });
  }
}

// ========================================
// ESTADÍSTICAS PARA DASHBOARD
// ========================================

async function obtenerEstadisticas(req, res) {
  try {
    const pool = obtenerPool();
    
    const [stats] = await pool.query(`
      SELECT 
        COUNT(CASE WHEN estado = 'activo' THEN 1 END) as activos,
        COUNT(CASE WHEN estado = 'cancelado' THEN 1 END) as cancelados,
        COUNT(CASE WHEN estado = 'suspendido' THEN 1 END) as suspendidos,
        COALESCE(SUM(tarifa_mensual), 0) as ingreso_potencial
      FROM clientes
    `);
    
    let clientesConAdeudo = 0;
    let totalAdeudo = 0;
    
    // Intentar obtener datos de cargos si la tabla existe
    try {
      const [adeudos] = await pool.query(`
        SELECT COUNT(DISTINCT c.id) as con_adeudo
        FROM clientes c
        INNER JOIN cargos ca ON c.id = ca.cliente_id
        WHERE ca.estado IN ('pendiente', 'parcial')
          AND c.estado = 'activo'
      `);
      clientesConAdeudo = adeudos[0].con_adeudo || 0;
      
      const [total] = await pool.query(`
        SELECT COALESCE(SUM(saldo_pendiente), 0) as total
        FROM cargos
        WHERE estado IN ('pendiente', 'parcial')
      `);
      totalAdeudo = parseFloat(total[0].total) || 0;
    } catch (e) {
      // Tabla cargos no existe aún
    }
    
    res.json({
      ok: true,
      estadisticas: {
        clientes_activos: stats[0].activos || 0,
        clientes_cancelados: stats[0].cancelados || 0,
        clientes_suspendidos: stats[0].suspendidos || 0,
        clientes_con_adeudo: clientesConAdeudo,
        ingreso_potencial: parseFloat(stats[0].ingreso_potencial) || 0,
        total_adeudo: totalAdeudo
      }
    });
  } catch (err) {
    console.error('❌ Error obtenerEstadisticas:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener estadísticas' });
  }
}

// ========================================
// HELPERS
// ========================================

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function generarNumeroCliente(pool) {
  const [rows] = await pool.query(
    `SELECT numero_cliente FROM clientes ORDER BY creado_en DESC LIMIT 1`
  );
  
  if (!rows.length) {
    return 'CLI-0001';
  }
  
  const ultimo = rows[0].numero_cliente;
  const num = parseInt(ultimo.split('-')[1]) + 1;
  return `CLI-${num.toString().padStart(4, '0')}`;
}

module.exports = {
  obtenerClientes,
  obtenerCliente,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
  obtenerEstadisticas
};

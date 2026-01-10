const { obtenerPool } = require('../configuracion/base_datos');

// ========================================
// OBTENER CLIENTES
// ========================================
async function obtenerClientes(req, res) {
  try {
    const { pagina = 1, limite = 10, estado, busqueda } = req.query;
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
              p.nombre as plan_nombre,
              p.precio_mensual as tarifa_plan
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
// CREAR CLIENTE (sin instalación)
// ========================================
async function crearCliente(req, res) {
  try {
    const {
      nombre, apellido_paterno, apellido_materno,
      telefono, telefono_secundario, email,
      ciudad_id, colonia_id, direccion, referencia,
      plan_id, cuota_mensual
    } = req.body;

    if (!nombre || !telefono) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre y teléfono son requeridos' });
    }

    const pool = obtenerPool();
    const id = generarUUID();
    const numero_cliente = await generarNumeroCliente(pool);

    await pool.query(
      `INSERT INTO clientes (
        id, numero_cliente, nombre, apellido_paterno, apellido_materno,
        telefono, telefono_secundario, email,
        ciudad_id, colonia_id, direccion, referencia,
        plan_id, cuota_mensual
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, numero_cliente, nombre, apellido_paterno || null, apellido_materno || null,
        telefono, telefono_secundario || null, email || null,
        ciudad_id || null, colonia_id || null, direccion || null, referencia || null,
        plan_id || null, cuota_mensual || 0
      ]
    );

    res.json({ ok: true, mensaje: 'Cliente creado', cliente: { id, numero_cliente } });
  } catch (err) {
    console.error('❌ Error crearCliente:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear cliente' });
  }
}

// ========================================
// CREAR CLIENTE CON INSTALACIÓN
// ========================================
async function crearClienteConInstalacion(req, res) {
  const pool = obtenerPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      nombre, apellido_paterno, apellido_materno,
      telefono, telefono_secundario, email,
      ciudad_id, colonia_id, direccion, referencia,
      plan_id, cuota_mensual, tarifa_mensual,
      fecha_instalacion, dia_corte, costo_instalacion,
      tecnico_instalador, notas_instalacion
    } = req.body;

    if (!nombre || !telefono) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre y teléfono son requeridos' });
    }

    if (!fecha_instalacion) {
      return res.status(400).json({ ok: false, mensaje: 'Fecha de instalación requerida' });
    }

    const clienteId = generarUUID();
    const numero_cliente = await generarNumeroCliente(pool);
    const tarifa = parseFloat(tarifa_mensual) || parseFloat(cuota_mensual) || 0;
    const diaCorte = parseInt(dia_corte) || 10;

    // 1. Crear cliente
    await connection.query(
      `INSERT INTO clientes (
        id, numero_cliente, nombre, apellido_paterno, apellido_materno,
        telefono, telefono_secundario, email,
        ciudad_id, colonia_id, direccion, referencia,
        plan_id, cuota_mensual, dia_corte,
        fecha_instalacion, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')`,
      [
        clienteId, numero_cliente, nombre, apellido_paterno || null, apellido_materno || null,
        telefono, telefono_secundario || null, email || null,
        ciudad_id || null, colonia_id || null, direccion || null, referencia || null,
        plan_id || null, tarifa, diaCorte, fecha_instalacion
      ]
    );

    // 2. Calcular y generar cargos
    const fechaInst = new Date(fecha_instalacion + 'T12:00:00');
    const diaInstalacion = fechaInst.getDate();
    const mes = fechaInst.getMonth();
    const anio = fechaInst.getFullYear();
    let cargosGenerados = 0;

    // Prorrateo
    if (tarifa > 0 && diaInstalacion !== diaCorte) {
      let diasProrrateo = 0;
      let mesProrrateo = mes;
      let anioProrrateo = anio;
      
      if (diaInstalacion < diaCorte) {
        diasProrrateo = diaCorte - diaInstalacion;
      } else {
        diasProrrateo = (30 - diaInstalacion) + diaCorte;
        mesProrrateo = mes + 1;
        if (mesProrrateo > 11) { mesProrrateo = 0; anioProrrateo++; }
      }
      
      if (diasProrrateo > 0) {
        const montoProrrateo = (tarifa / 30) * diasProrrateo;
        const periodo = `${anioProrrateo}-${String(mesProrrateo + 1).padStart(2, '0')}`;
        const ultimoDia = new Date(anioProrrateo, mesProrrateo + 1, 0).getDate();
        const fechaVenc = new Date(anioProrrateo, mesProrrateo, diaCorte);
        
        await connection.query(
          `INSERT INTO mensualidades (id, cliente_id, periodo, fecha_inicio, fecha_fin, fecha_vencimiento, monto, es_prorrateado, dias_prorrateados, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'pendiente')`,
          [generarUUID(), clienteId, periodo, fecha_instalacion, 
           `${anioProrrateo}-${String(mesProrrateo + 1).padStart(2, '0')}-${ultimoDia}`,
           fechaVenc.toISOString().split('T')[0], montoProrrateo.toFixed(2), diasProrrateo]
        );
        cargosGenerados++;
      }
    }

    // Costo de instalación
    if (parseFloat(costo_instalacion) > 0) {
      await connection.query(
        `INSERT INTO instalaciones (id, cliente_id, monto, fecha_instalacion, notas, estado)
         VALUES (?, ?, ?, ?, ?, 'pendiente')`,
        [generarUUID(), clienteId, costo_instalacion, fecha_instalacion, notas_instalacion || 'Instalación inicial']
      );
      cargosGenerados++;
    }

    // Primera mensualidad
    if (tarifa > 0) {
      let mesMensualidad = mes;
      let anioMensualidad = anio;
      
      if (diaInstalacion < diaCorte) {
        mesMensualidad = mes + 1;
        if (mesMensualidad > 11) { mesMensualidad = 0; anioMensualidad++; }
      }
      
      const periodo = `${anioMensualidad}-${String(mesMensualidad + 1).padStart(2, '0')}`;
      const ultimoDia = new Date(anioMensualidad, mesMensualidad + 1, 0).getDate();
      const fechaVenc = new Date(anioMensualidad, mesMensualidad, diaCorte);
      
      await connection.query(
        `INSERT INTO mensualidades (id, cliente_id, periodo, fecha_inicio, fecha_fin, fecha_vencimiento, monto, es_prorrateado, dias_prorrateados, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'pendiente')`,
        [generarUUID(), clienteId, periodo,
         `${anioMensualidad}-${String(mesMensualidad + 1).padStart(2, '0')}-01`,
         `${anioMensualidad}-${String(mesMensualidad + 1).padStart(2, '0')}-${ultimoDia}`,
         fechaVenc.toISOString().split('T')[0], tarifa]
      );
      cargosGenerados++;
    }

    await connection.commit();

    res.json({ 
      ok: true, 
      mensaje: 'Cliente creado con instalación',
      cliente: { id: clienteId, numero_cliente },
      cargos_generados: cargosGenerados
    });

  } catch (err) {
    await connection.rollback();
    console.error('❌ Error crearClienteConInstalacion:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear cliente con instalación', error: err.message });
  } finally {
    connection.release();
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
      plan_id, cuota_mensual, dia_corte, estado
    } = req.body;

    const pool = obtenerPool();

    const [existe] = await pool.query('SELECT id FROM clientes WHERE id = ?', [id]);
    if (!existe.length) {
      return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    }

    await pool.query(
      `UPDATE clientes SET
        nombre = ?, apellido_paterno = ?, apellido_materno = ?,
        telefono = ?, telefono_secundario = ?, email = ?,
        ciudad_id = ?, colonia_id = ?, direccion = ?, referencia = ?,
        plan_id = ?, cuota_mensual = ?, dia_corte = ?, estado = ?
       WHERE id = ?`,
      [
        nombre, apellido_paterno || null, apellido_materno || null,
        telefono, telefono_secundario || null, email || null,
        ciudad_id || null, colonia_id || null, direccion || null, referencia || null,
        plan_id || null, cuota_mensual || 0, dia_corte || 10, estado || 'activo',
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
// REGISTRAR INSTALACIÓN (cliente existente)
// ========================================
async function registrarInstalacion(req, res) {
  const pool = obtenerPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const {
      fecha_instalacion, dia_corte, plan_id, tarifa_mensual,
      costo_instalacion, tecnico_instalador, notas_instalacion
    } = req.body;

    if (!fecha_instalacion) {
      return res.status(400).json({ ok: false, mensaje: 'Fecha de instalación requerida' });
    }

    const [cliente] = await connection.query('SELECT * FROM clientes WHERE id = ?', [id]);
    if (!cliente.length) {
      return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    }

    if (cliente[0].fecha_instalacion) {
      return res.status(400).json({ ok: false, mensaje: 'Este cliente ya tiene instalación registrada' });
    }

    const tarifa = parseFloat(tarifa_mensual) || parseFloat(cliente[0].cuota_mensual) || 0;
    const diaCorte = parseInt(dia_corte) || 10;

    // 1. Actualizar cliente
    await connection.query(
      `UPDATE clientes SET 
        fecha_instalacion = ?, dia_corte = ?, plan_id = COALESCE(?, plan_id),
        cuota_mensual = ?
       WHERE id = ?`,
      [fecha_instalacion, diaCorte, plan_id, tarifa, id]
    );

    // 2. Generar cargos
    const fechaInst = new Date(fecha_instalacion + 'T12:00:00');
    const diaInstalacion = fechaInst.getDate();
    const mes = fechaInst.getMonth();
    const anio = fechaInst.getFullYear();
    let cargosGenerados = 0;

    // Prorrateo
    if (tarifa > 0 && diaInstalacion !== diaCorte) {
      let diasProrrateo = 0;
      let mesProrrateo = mes;
      let anioProrrateo = anio;
      
      if (diaInstalacion < diaCorte) {
        diasProrrateo = diaCorte - diaInstalacion;
      } else {
        diasProrrateo = (30 - diaInstalacion) + diaCorte;
        mesProrrateo = mes + 1;
        if (mesProrrateo > 11) { mesProrrateo = 0; anioProrrateo++; }
      }
      
      if (diasProrrateo > 0) {
        const montoProrrateo = (tarifa / 30) * diasProrrateo;
        const periodo = `${anioProrrateo}-${String(mesProrrateo + 1).padStart(2, '0')}`;
        const ultimoDia = new Date(anioProrrateo, mesProrrateo + 1, 0).getDate();
        const fechaVenc = new Date(anioProrrateo, mesProrrateo, diaCorte);
        
        await connection.query(
          `INSERT INTO mensualidades (id, cliente_id, periodo, fecha_inicio, fecha_fin, fecha_vencimiento, monto, es_prorrateado, dias_prorrateados, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'pendiente')`,
          [generarUUID(), id, periodo, fecha_instalacion, 
           `${anioProrrateo}-${String(mesProrrateo + 1).padStart(2, '0')}-${ultimoDia}`,
           fechaVenc.toISOString().split('T')[0], montoProrrateo.toFixed(2), diasProrrateo]
        );
        cargosGenerados++;
      }
    }

    // Costo instalación
    if (parseFloat(costo_instalacion) > 0) {
      await connection.query(
        `INSERT INTO instalaciones (id, cliente_id, monto, fecha_instalacion, notas, estado)
         VALUES (?, ?, ?, ?, ?, 'pendiente')`,
        [generarUUID(), id, costo_instalacion, fecha_instalacion, notas_instalacion || 'Instalación']
      );
      cargosGenerados++;
    }

    // Primera mensualidad
    if (tarifa > 0) {
      let mesMensualidad = mes;
      let anioMensualidad = anio;
      
      if (diaInstalacion < diaCorte) {
        mesMensualidad = mes + 1;
        if (mesMensualidad > 11) { mesMensualidad = 0; anioMensualidad++; }
      }
      
      const periodo = `${anioMensualidad}-${String(mesMensualidad + 1).padStart(2, '0')}`;
      const ultimoDia = new Date(anioMensualidad, mesMensualidad + 1, 0).getDate();
      const fechaVenc = new Date(anioMensualidad, mesMensualidad, diaCorte);
      
      await connection.query(
        `INSERT INTO mensualidades (id, cliente_id, periodo, fecha_inicio, fecha_fin, fecha_vencimiento, monto, es_prorrateado, dias_prorrateados, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'pendiente')`,
        [generarUUID(), id, periodo,
         `${anioMensualidad}-${String(mesMensualidad + 1).padStart(2, '0')}-01`,
         `${anioMensualidad}-${String(mesMensualidad + 1).padStart(2, '0')}-${ultimoDia}`,
         fechaVenc.toISOString().split('T')[0], tarifa]
      );
      cargosGenerados++;
    }

    await connection.commit();

    res.json({ 
      ok: true, 
      mensaje: 'Instalación registrada',
      cargos_generados: cargosGenerados
    });

  } catch (err) {
    await connection.rollback();
    console.error('❌ Error registrarInstalacion:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al registrar instalación', error: err.message });
  } finally {
    connection.release();
  }
}

// ========================================
// ELIMINAR CLIENTE
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
// HELPERS
// ========================================
function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function generarNumeroCliente(pool) {
  const [rows] = await pool.query(
    `SELECT numero_cliente FROM clientes ORDER BY creado_en DESC LIMIT 1`
  );
  if (!rows.length) return 'CLI-0001';
  const ultimo = rows[0].numero_cliente;
  const num = parseInt(ultimo.split('-')[1]) + 1;
  return `CLI-${num.toString().padStart(4, '0')}`;
}

module.exports = {
  obtenerClientes,
  obtenerCliente,
  crearCliente,
  crearClienteConInstalacion,
  actualizarCliente,
  eliminarCliente,
  registrarInstalacion
};

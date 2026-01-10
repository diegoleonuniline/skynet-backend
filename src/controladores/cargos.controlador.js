const { obtenerPool } = require('../configuracion/base_datos');

// ========================================
// CATÁLOGOS - TIPOS DE CARGO
// ========================================

async function obtenerTiposCargo(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query('SELECT * FROM tipos_cargo WHERE activo = 1 ORDER BY nombre');
    res.json({ ok: true, tipos: rows });
  } catch (err) {
    console.error('❌ Error obtenerTiposCargo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener tipos' });
  }
}

async function crearTipoCargo(req, res) {
  try {
    const { nombre, descripcion, es_recurrente } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Nombre requerido' });

    const pool = obtenerPool();
    const id = generarUUID();
    await pool.query(
      'INSERT INTO tipos_cargo (id, nombre, descripcion, es_recurrente) VALUES (?, ?, ?, ?)',
      [id, nombre, descripcion, es_recurrente || 0]
    );
    res.json({ ok: true, mensaje: 'Tipo creado', tipo: { id, nombre } });
  } catch (err) {
    console.error('❌ Error crearTipoCargo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear tipo' });
  }
}

// ========================================
// CARGOS - CRUD
// ========================================

async function obtenerCargos(req, res) {
  try {
    const { cliente_id, estado, desde, hasta } = req.query;
    const pool = obtenerPool();
    
    let query = `
      SELECT c.*, tc.nombre as tipo_nombre
      FROM cargos c
      LEFT JOIN tipos_cargo tc ON c.tipo_cargo_id = tc.id
      WHERE 1=1
    `;
    const params = [];
    
    if (cliente_id) {
      query += ` AND c.cliente_id = ?`;
      params.push(cliente_id);
    }
    
    if (estado) {
      query += ` AND c.estado = ?`;
      params.push(estado);
    }
    
    if (desde) {
      query += ` AND c.fecha_vencimiento >= ?`;
      params.push(desde);
    }
    
    if (hasta) {
      query += ` AND c.fecha_vencimiento <= ?`;
      params.push(hasta);
    }
    
    query += ` ORDER BY c.fecha_vencimiento ASC`;
    
    const [rows] = await pool.query(query, params);
    res.json({ ok: true, cargos: rows });
  } catch (err) {
    console.error('❌ Error obtenerCargos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener cargos' });
  }
}

async function obtenerCargoPorId(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();
    
    const [rows] = await pool.query(`
      SELECT c.*, tc.nombre as tipo_nombre
      FROM cargos c
      LEFT JOIN tipos_cargo tc ON c.tipo_cargo_id = tc.id
      WHERE c.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Cargo no encontrado' });
    }
    
    res.json({ ok: true, cargo: rows[0] });
  } catch (err) {
    console.error('❌ Error obtenerCargoPorId:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener cargo' });
  }
}

async function crearCargo(req, res) {
  try {
    const { 
      cliente_id, tipo_cargo_id, concepto, descripcion, monto,
      fecha_cargo, fecha_vencimiento, mes_correspondiente, anio_correspondiente
    } = req.body;
    
    if (!cliente_id || !concepto || !monto) {
      return res.status(400).json({ ok: false, mensaje: 'Datos incompletos' });
    }

    const pool = obtenerPool();
    const id = generarUUID();
    const hoy = new Date().toISOString().split('T')[0];
    
    await pool.query(`
      INSERT INTO cargos (id, cliente_id, tipo_cargo_id, concepto, descripcion, monto, fecha_cargo, fecha_vencimiento, mes_correspondiente, anio_correspondiente)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, cliente_id, tipo_cargo_id, concepto, descripcion, monto,
      fecha_cargo || hoy, fecha_vencimiento || hoy,
      mes_correspondiente, anio_correspondiente
    ]);

    res.json({ ok: true, mensaje: 'Cargo creado', cargo: { id } });
  } catch (err) {
    console.error('❌ Error crearCargo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear cargo' });
  }
}

async function actualizarCargo(req, res) {
  try {
    const { id } = req.params;
    const { concepto, descripcion, monto, fecha_vencimiento, estado } = req.body;
    
    const pool = obtenerPool();
    
    await pool.query(`
      UPDATE cargos SET concepto = ?, descripcion = ?, monto = ?, fecha_vencimiento = ?, estado = ?
      WHERE id = ?
    `, [concepto, descripcion, monto, fecha_vencimiento, estado, id]);

    res.json({ ok: true, mensaje: 'Cargo actualizado' });
  } catch (err) {
    console.error('❌ Error actualizarCargo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar cargo' });
  }
}

async function eliminarCargo(req, res) {
  try {
    const { id } = req.params;
    const pool = obtenerPool();
    
    // Solo cancelar, no borrar
    await pool.query('UPDATE cargos SET estado = "cancelado" WHERE id = ?', [id]);
    res.json({ ok: true, mensaje: 'Cargo cancelado' });
  } catch (err) {
    console.error('❌ Error eliminarCargo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al cancelar cargo' });
  }
}

// ========================================
// LÓGICA DE GENERACIÓN DE CARGOS
// ========================================

/**
 * Genera cargos iniciales al registrar/instalar un cliente:
 * 1. Cargo de instalación (si aplica)
 * 2. Cargo prorrateado (días desde instalación hasta día 10)
 * 3. Primer cargo mensual completo (a partir del día 10)
 */
async function generarCargosIniciales(clienteId, fechaInstalacion, tarifaMensual, costoInstalacion = 0) {
  const pool = obtenerPool();
  const cargosGenerados = [];
  
  const fecha = new Date(fechaInstalacion);
  const diaInstalacion = fecha.getDate();
  const mesInstalacion = fecha.getMonth();
  const anioInstalacion = fecha.getFullYear();
  const diaCorte = 10;
  
  // 1. CARGO DE INSTALACIÓN (si hay costo)
  if (costoInstalacion > 0) {
    const idInstalacion = generarUUID();
    await pool.query(`
      INSERT INTO cargos (id, cliente_id, concepto, descripcion, monto, fecha_cargo, fecha_vencimiento, mes_correspondiente, anio_correspondiente)
      VALUES (?, ?, 'Instalación', 'Costo de instalación del servicio', ?, ?, ?, ?, ?)
    `, [idInstalacion, clienteId, costoInstalacion, fechaInstalacion, fechaInstalacion, mesInstalacion + 1, anioInstalacion]);
    
    cargosGenerados.push({ tipo: 'instalacion', monto: costoInstalacion });
  }
  
  // 2. CARGO PRORRATEADO (si se instaló antes del día 10)
  if (diaInstalacion < diaCorte) {
    const diasRestantes = diaCorte - diaInstalacion;
    const costoDiario = tarifaMensual / 30;
    const montoProrrateo = Math.round(diasRestantes * costoDiario * 100) / 100;
    
    // Fecha de vencimiento: día 10 del mes actual
    const fechaVencimientoProrrateo = new Date(anioInstalacion, mesInstalacion, diaCorte);
    
    const idProrrateo = generarUUID();
    await pool.query(`
      INSERT INTO cargos (id, cliente_id, concepto, descripcion, monto, fecha_cargo, fecha_vencimiento, mes_correspondiente, anio_correspondiente)
      VALUES (?, ?, 'Prorrateo', ?, ?, ?, ?, ?, ?)
    `, [
      idProrrateo, clienteId,
      `Prorrateo ${diasRestantes} días (del ${diaInstalacion} al ${diaCorte})`,
      montoProrrateo, fechaInstalacion, 
      fechaVencimientoProrrateo.toISOString().split('T')[0],
      mesInstalacion + 1, anioInstalacion
    ]);
    
    cargosGenerados.push({ tipo: 'prorrateo', dias: diasRestantes, monto: montoProrrateo });
  }
  
  // 3. PRIMER CARGO MENSUAL COMPLETO
  // Si instaló antes del 10: el cargo es para el MES SIGUIENTE
  // Si instaló el 10 o después: el cargo es para el mes actual (periodo 10-10)
  let mesCargo, anioCargo, fechaVencimiento;
  
  if (diaInstalacion < diaCorte) {
    // Instaló antes del 10, primer cargo completo es del siguiente periodo
    mesCargo = mesInstalacion + 1;
    anioCargo = anioInstalacion;
    if (mesCargo > 11) {
      mesCargo = 0;
      anioCargo++;
    }
    fechaVencimiento = new Date(anioCargo, mesCargo, diaCorte);
  } else {
    // Instaló el 10 o después, primer cargo es del periodo actual
    mesCargo = mesInstalacion;
    anioCargo = anioInstalacion;
    fechaVencimiento = new Date(anioCargo, mesCargo, diaCorte);
    
    // Si ya pasó el día 10, el vencimiento es el próximo mes
    if (diaInstalacion > diaCorte) {
      fechaVencimiento = new Date(anioCargo, mesCargo + 1, diaCorte);
      mesCargo = fechaVencimiento.getMonth();
      anioCargo = fechaVencimiento.getFullYear();
    }
  }
  
  const nombresMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const idMensualidad = generarUUID();
  
  await pool.query(`
    INSERT INTO cargos (id, cliente_id, concepto, descripcion, monto, fecha_cargo, fecha_vencimiento, mes_correspondiente, anio_correspondiente)
    VALUES (?, ?, 'Mensualidad', ?, ?, ?, ?, ?, ?)
  `, [
    idMensualidad, clienteId,
    `Mensualidad ${nombresMeses[mesCargo]} ${anioCargo}`,
    tarifaMensual, fechaInstalacion,
    fechaVencimiento.toISOString().split('T')[0],
    mesCargo + 1, anioCargo
  ]);
  
  cargosGenerados.push({ tipo: 'mensualidad', mes: nombresMeses[mesCargo], monto: tarifaMensual });
  
  return cargosGenerados;
}

/**
 * Genera cargo mensual para un cliente
 */
async function generarCargoMensual(clienteId, mes, anio, tarifa) {
  const pool = obtenerPool();
  const nombresMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  
  // Verificar si ya existe cargo para ese mes
  const [existe] = await pool.query(
    'SELECT id FROM cargos WHERE cliente_id = ? AND mes_correspondiente = ? AND anio_correspondiente = ? AND concepto = "Mensualidad"',
    [clienteId, mes, anio]
  );
  
  if (existe.length > 0) {
    return { ok: false, mensaje: 'Ya existe cargo para ese mes' };
  }
  
  const fechaVencimiento = new Date(anio, mes - 1, 10);
  const id = generarUUID();
  
  await pool.query(`
    INSERT INTO cargos (id, cliente_id, concepto, descripcion, monto, fecha_cargo, fecha_vencimiento, mes_correspondiente, anio_correspondiente)
    VALUES (?, ?, 'Mensualidad', ?, ?, CURDATE(), ?, ?, ?)
  `, [
    id, clienteId,
    `Mensualidad ${nombresMeses[mes - 1]} ${anio}`,
    tarifa,
    fechaVencimiento.toISOString().split('T')[0],
    mes, anio
  ]);
  
  return { ok: true, cargo_id: id };
}

/**
 * Genera cargos mensuales masivos para todos los clientes activos
 */
async function generarCargosMensualesMasivo(req, res) {
  try {
    const { mes, anio } = req.body;
    
    if (!mes || !anio) {
      return res.status(400).json({ ok: false, mensaje: 'Mes y año requeridos' });
    }
    
    const pool = obtenerPool();
    
    // Obtener clientes activos con tarifa
    const [clientes] = await pool.query(`
      SELECT id, tarifa_mensual 
      FROM clientes 
      WHERE estado = 'activo' AND tarifa_mensual > 0
    `);
    
    let generados = 0;
    let existentes = 0;
    
    for (const cliente of clientes) {
      const resultado = await generarCargoMensual(cliente.id, mes, anio, cliente.tarifa_mensual);
      if (resultado.ok) generados++;
      else existentes++;
    }
    
    res.json({ 
      ok: true, 
      mensaje: `Cargos generados: ${generados}, ya existían: ${existentes}`,
      generados,
      existentes
    });
  } catch (err) {
    console.error('❌ Error generarCargosMensualesMasivo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al generar cargos' });
  }
}

// ========================================
// ESTADO DE CUENTA
// ========================================

async function obtenerEstadoCuenta(req, res) {
  try {
    const { cliente_id } = req.params;
    const pool = obtenerPool();
    
    // Info del cliente
    const [cliente] = await pool.query(`
      SELECT id, nombre, apellido_paterno, numero_cliente, tarifa_mensual, saldo_favor, estado
      FROM clientes WHERE id = ?
    `, [cliente_id]);
    
    if (cliente.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    }
    
    // Cargos pendientes
    const [cargosPendientes] = await pool.query(`
      SELECT * FROM cargos 
      WHERE cliente_id = ? AND estado IN ('pendiente', 'parcial')
      ORDER BY fecha_vencimiento ASC
    `, [cliente_id]);
    
    // Total adeudo
    const totalAdeudo = cargosPendientes.reduce((sum, c) => sum + parseFloat(c.saldo_pendiente || 0), 0);
    
    // Últimos pagos
    const [ultimosPagos] = await pool.query(`
      SELECT p.*, mp.nombre as metodo_nombre
      FROM pagos p
      LEFT JOIN metodos_pago mp ON p.metodo_pago_id = mp.id
      WHERE p.cliente_id = ?
      ORDER BY p.fecha_pago DESC
      LIMIT 10
    `, [cliente_id]);
    
    res.json({
      ok: true,
      cliente: cliente[0],
      cargos_pendientes: cargosPendientes,
      total_adeudo: totalAdeudo,
      saldo_favor: parseFloat(cliente[0].saldo_favor) || 0,
      ultimos_pagos: ultimosPagos
    });
  } catch (err) {
    console.error('❌ Error obtenerEstadoCuenta:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener estado de cuenta' });
  }
}

// ========================================
// REPORTES
// ========================================

async function reporteAdeudos(req, res) {
  try {
    const { fecha_corte } = req.query;
    const pool = obtenerPool();
    
    const fechaLimite = fecha_corte || new Date().toISOString().split('T')[0];
    
    const [rows] = await pool.query(`
      SELECT 
        c.id, c.nombre, c.apellido_paterno, c.numero_cliente, c.telefono,
        c.tarifa_mensual, ci.nombre as ciudad_nombre,
        SUM(ca.saldo_pendiente) as total_adeudo,
        COUNT(ca.id) as cargos_pendientes,
        MIN(ca.fecha_vencimiento) as vencimiento_mas_antiguo
      FROM clientes c
      LEFT JOIN ciudades ci ON c.ciudad_id = ci.id
      INNER JOIN cargos ca ON c.id = ca.cliente_id
      WHERE ca.estado IN ('pendiente', 'parcial')
        AND ca.fecha_vencimiento <= ?
        AND c.estado = 'activo'
      GROUP BY c.id
      HAVING total_adeudo > 0
      ORDER BY total_adeudo DESC
    `, [fechaLimite]);
    
    res.json({ ok: true, clientes_con_adeudo: rows });
  } catch (err) {
    console.error('❌ Error reporteAdeudos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al generar reporte' });
  }
}

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  // Catálogos
  obtenerTiposCargo,
  crearTipoCargo,
  // CRUD Cargos
  obtenerCargos,
  obtenerCargoPorId,
  crearCargo,
  actualizarCargo,
  eliminarCargo,
  // Generación automática
  generarCargosIniciales,
  generarCargoMensual,
  generarCargosMensualesMasivo,
  // Estado de cuenta
  obtenerEstadoCuenta,
  // Reportes
  reporteAdeudos
};

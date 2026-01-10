const { obtenerPool } = require('../configuracion/base_datos');

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ========================================
// CATÁLOGO DE TIPOS DE CARGO
// ========================================

async function obtenerTiposCargo(req, res) {
  try {
    const pool = obtenerPool();
    const [rows] = await pool.query('SELECT * FROM tipos_cargo WHERE activo = 1 ORDER BY nombre');
    res.json({ ok: true, tipos: rows });
  } catch (err) {
    console.error('❌ Error obtenerTiposCargo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener tipos de cargo' });
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
      [id, nombre, descripcion || null, es_recurrente ? 1 : 0]
    );
    res.json({ ok: true, mensaje: 'Tipo de cargo creado', tipo: { id, nombre } });
  } catch (err) {
    console.error('❌ Error crearTipoCargo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear tipo de cargo' });
  }
}

// ========================================
// OBTENER CARGOS
// ========================================

async function obtenerCargos(req, res) {
  try {
    const { cliente_id, estado } = req.query;
    const pool = obtenerPool();
    
    let sql = `
      SELECT c.*, tc.nombre as tipo_nombre 
      FROM cargos c
      LEFT JOIN tipos_cargo tc ON tc.id = c.tipo_cargo_id
      WHERE 1=1
    `;
    const params = [];
    
    if (cliente_id) {
      sql += ' AND c.cliente_id = ?';
      params.push(cliente_id);
    }
    
    if (estado && estado !== 'todos') {
      sql += ' AND c.estado = ?';
      params.push(estado);
    }
    
    sql += ' ORDER BY c.fecha_vencimiento ASC';
    
    const [rows] = await pool.query(sql, params);
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
      LEFT JOIN tipos_cargo tc ON tc.id = c.tipo_cargo_id
      WHERE c.id = ?
    `, [id]);
    
    if (!rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Cargo no encontrado' });
    }
    
    res.json({ ok: true, cargo: rows[0] });
  } catch (err) {
    console.error('❌ Error obtenerCargoPorId:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener cargo' });
  }
}

// ========================================
// CREAR CARGO MANUAL
// ========================================

async function crearCargo(req, res) {
  try {
    const { cliente_id, tipo_cargo_id, concepto, descripcion, monto, fecha_vencimiento } = req.body;
    
    if (!cliente_id || !concepto || !monto) {
      return res.status(400).json({ ok: false, mensaje: 'Cliente, concepto y monto son requeridos' });
    }
    
    const pool = obtenerPool();
    const id = generarUUID();
    const hoy = new Date().toISOString().split('T')[0];
    
    await pool.query(`
      INSERT INTO cargos (id, cliente_id, tipo_cargo_id, concepto, descripcion, monto, fecha_cargo, fecha_vencimiento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, cliente_id, tipo_cargo_id || null, concepto, descripcion || null, monto, hoy, fecha_vencimiento || hoy]);
    
    // Actualizar saldo_pendiente del cliente
    await actualizarSaldoCliente(pool, cliente_id);
    
    res.json({ ok: true, mensaje: 'Cargo creado', cargo: { id } });
  } catch (err) {
    console.error('❌ Error crearCargo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear cargo' });
  }
}

// ========================================
// GENERAR CARGOS INICIALES (al crear cliente)
// ========================================

async function generarCargosIniciales(clienteId, fechaInstalacion, tarifaMensual, costoInstalacion = 0, diaCorte = 10) {
  const pool = obtenerPool();
  const cargosGenerados = [];
  
  try {
    // Obtener tipos de cargo
    const [tipos] = await pool.query('SELECT id, nombre FROM tipos_cargo WHERE activo = 1');
    const tipoInstalacion = tipos.find(t => t.nombre.toLowerCase().includes('instalación') || t.nombre.toLowerCase().includes('instalacion'));
    const tipoProrrateo = tipos.find(t => t.nombre.toLowerCase().includes('prorrateo'));
    const tipoMensualidad = tipos.find(t => t.nombre.toLowerCase().includes('mensualidad'));
    
    const fechaIns = new Date(fechaInstalacion);
    const diaInstalacion = fechaIns.getDate();
    const mesInstalacion = fechaIns.getMonth();
    const anioInstalacion = fechaIns.getFullYear();
    
    // 1. CARGO DE INSTALACIÓN (si hay costo)
    if (costoInstalacion > 0) {
      const idInstalacion = generarUUID();
      await pool.query(`
        INSERT INTO cargos (id, cliente_id, tipo_cargo_id, concepto, descripcion, monto, fecha_cargo, fecha_vencimiento)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        idInstalacion, clienteId, tipoInstalacion?.id || null,
        'Instalación del servicio', 'Cargo único por instalación',
        costoInstalacion, fechaInstalacion, fechaInstalacion
      ]);
      cargosGenerados.push({ tipo: 'instalacion', monto: costoInstalacion });
    }
    
    // 2. PRORRATEO (si instaló antes del día de corte)
    if (diaInstalacion < diaCorte) {
      const diasRestantes = diaCorte - diaInstalacion;
      const costoDiario = tarifaMensual / 30;
      const montoProrrateo = Math.round(diasRestantes * costoDiario * 100) / 100;
      
      if (montoProrrateo > 0) {
        const fechaVencProrrateo = new Date(anioInstalacion, mesInstalacion, diaCorte);
        const idProrrateo = generarUUID();
        
        await pool.query(`
          INSERT INTO cargos (id, cliente_id, tipo_cargo_id, concepto, descripcion, monto, fecha_cargo, fecha_vencimiento, mes_correspondiente, anio_correspondiente)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          idProrrateo, clienteId, tipoProrrateo?.id || null,
          `Prorrateo ${diasRestantes} días`, `Del día ${diaInstalacion} al ${diaCorte}`,
          montoProrrateo, fechaInstalacion, fechaVencProrrateo.toISOString().split('T')[0],
          mesInstalacion + 1, anioInstalacion
        ]);
        cargosGenerados.push({ tipo: 'prorrateo', monto: montoProrrateo, dias: diasRestantes });
      }
    }
    
    // 3. PRIMERA MENSUALIDAD
    let mesMensualidad, anioMensualidad;
    if (diaInstalacion < diaCorte) {
      // Si instaló antes del corte, la mensualidad es del siguiente mes
      mesMensualidad = mesInstalacion + 1;
      anioMensualidad = anioInstalacion;
      if (mesMensualidad > 11) {
        mesMensualidad = 0;
        anioMensualidad++;
      }
    } else {
      // Si instaló el día del corte o después, la mensualidad es del mes actual
      mesMensualidad = mesInstalacion;
      anioMensualidad = anioInstalacion;
    }
    
    const nombresMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const fechaVencMensualidad = new Date(anioMensualidad, mesMensualidad, diaCorte);
    const idMensualidad = generarUUID();
    
    await pool.query(`
      INSERT INTO cargos (id, cliente_id, tipo_cargo_id, concepto, descripcion, monto, fecha_cargo, fecha_vencimiento, mes_correspondiente, anio_correspondiente)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      idMensualidad, clienteId, tipoMensualidad?.id || null,
      `Mensualidad ${nombresMeses[mesMensualidad]} ${anioMensualidad}`, 'Servicio de internet',
      tarifaMensual, fechaInstalacion, fechaVencMensualidad.toISOString().split('T')[0],
      mesMensualidad + 1, anioMensualidad
    ]);
    cargosGenerados.push({ tipo: 'mensualidad', monto: tarifaMensual, mes: nombresMeses[mesMensualidad] });
    
    // Actualizar saldo pendiente del cliente
    await actualizarSaldoCliente(pool, clienteId);
    
    return cargosGenerados;
    
  } catch (err) {
    console.error('❌ Error generarCargosIniciales:', err.message);
    throw err;
  }
}

// ========================================
// GENERAR CARGOS MENSUALES MASIVOS
// ========================================

async function generarCargosMensuales(req, res) {
  try {
    const { mes, anio } = req.body;
    
    if (!mes || !anio) {
      return res.status(400).json({ ok: false, mensaje: 'Mes y año son requeridos' });
    }
    
    const pool = obtenerPool();
    
    // Obtener tipo mensualidad
    const [tipos] = await pool.query('SELECT id FROM tipos_cargo WHERE nombre LIKE "%ensualidad%" LIMIT 1');
    const tipoMensualidadId = tipos[0]?.id || null;
    
    // Obtener clientes activos con tarifa
    const [clientes] = await pool.query(`
      SELECT id, COALESCE(tarifa_mensual, cuota_mensual) as tarifa, dia_corte 
      FROM clientes 
      WHERE estado = 'activo' AND COALESCE(tarifa_mensual, cuota_mensual) > 0
    `);
    
    const nombresMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    let generados = 0;
    let existentes = 0;
    
    for (const cliente of clientes) {
      // Verificar si ya existe cargo para ese mes
      const [existe] = await pool.query(
        'SELECT id FROM cargos WHERE cliente_id = ? AND mes_correspondiente = ? AND anio_correspondiente = ? AND estado != "cancelado"',
        [cliente.id, mes, anio]
      );
      
      if (existe.length > 0) {
        existentes++;
        continue;
      }
      
      const diaCorte = cliente.dia_corte || 10;
      const fechaVenc = new Date(anio, mes - 1, diaCorte);
      const id = generarUUID();
      
      await pool.query(`
        INSERT INTO cargos (id, cliente_id, tipo_cargo_id, concepto, descripcion, monto, fecha_cargo, fecha_vencimiento, mes_correspondiente, anio_correspondiente)
        VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?)
      `, [
        id, cliente.id, tipoMensualidadId,
        `Mensualidad ${nombresMeses[mes-1]} ${anio}`, 'Servicio de internet',
        cliente.tarifa, fechaVenc.toISOString().split('T')[0], mes, anio
      ]);
      
      await actualizarSaldoCliente(pool, cliente.id);
      generados++;
    }
    
    res.json({ 
      ok: true, 
      mensaje: `Cargos generados: ${generados}, Ya existían: ${existentes}`,
      generados,
      existentes
    });
  } catch (err) {
    console.error('❌ Error generarCargosMensuales:', err.message);
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
    
    // Info cliente
    const [cliente] = await pool.query(
      'SELECT id, nombre, apellido_paterno, saldo_favor, saldo_pendiente FROM clientes WHERE id = ?',
      [cliente_id]
    );
    
    if (!cliente.length) {
      return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    }
    
    // Cargos pendientes
    const [cargosPendientes] = await pool.query(`
      SELECT c.*, tc.nombre as tipo_nombre
      FROM cargos c
      LEFT JOIN tipos_cargo tc ON tc.id = c.tipo_cargo_id
      WHERE c.cliente_id = ? AND c.estado IN ('pendiente', 'parcial')
      ORDER BY c.fecha_vencimiento ASC
    `, [cliente_id]);
    
    // Total adeudo
    const [adeudo] = await pool.query(
      'SELECT COALESCE(SUM(saldo_pendiente), 0) as total FROM cargos WHERE cliente_id = ? AND estado IN ("pendiente", "parcial")',
      [cliente_id]
    );
    
    res.json({
      ok: true,
      cliente: cliente[0],
      cargos_pendientes: cargosPendientes,
      total_adeudo: parseFloat(adeudo[0].total) || 0,
      saldo_favor: parseFloat(cliente[0].saldo_favor) || 0
    });
  } catch (err) {
    console.error('❌ Error obtenerEstadoCuenta:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener estado de cuenta' });
  }
}

// ========================================
// REPORTE DE ADEUDOS
// ========================================

async function reporteAdeudos(req, res) {
  try {
    const pool = obtenerPool();
    
    const [rows] = await pool.query(`
      SELECT 
        c.id, c.numero_cliente, c.nombre, c.apellido_paterno, c.telefono,
        c.saldo_pendiente as total_adeudo,
        COUNT(ca.id) as cargos_pendientes,
        MIN(ca.fecha_vencimiento) as vencimiento_mas_antiguo
      FROM clientes c
      INNER JOIN cargos ca ON c.id = ca.cliente_id AND ca.estado IN ('pendiente', 'parcial')
      WHERE c.estado = 'activo'
      GROUP BY c.id
      HAVING total_adeudo > 0
      ORDER BY total_adeudo DESC
    `);
    
    res.json({ ok: true, clientes: rows });
  } catch (err) {
    console.error('❌ Error reporteAdeudos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al generar reporte' });
  }
}

// ========================================
// HELPER: Actualizar saldo del cliente
// ========================================

async function actualizarSaldoCliente(pool, clienteId) {
  const [result] = await pool.query(
    'SELECT COALESCE(SUM(saldo_pendiente), 0) as total FROM cargos WHERE cliente_id = ? AND estado IN ("pendiente", "parcial")',
    [clienteId]
  );
  await pool.query('UPDATE clientes SET saldo_pendiente = ? WHERE id = ?', [result[0].total, clienteId]);
}

module.exports = {
  obtenerTiposCargo,
  crearTipoCargo,
  obtenerCargos,
  obtenerCargoPorId,
  crearCargo,
  generarCargosIniciales,
  generarCargosMensuales,
  obtenerEstadoCuenta,
  reporteAdeudos,
  actualizarSaldoCliente
};

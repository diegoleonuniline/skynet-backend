const { obtenerPool } = require('../configuracion/base_datos');

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ========================================
// CALCULAR CARGOS (preview antes de guardar)
// ========================================
async function calcularCargos(req, res) {
  try {
    const { fecha_instalacion, tarifa_mensual, costo_instalacion, dia_corte = 10 } = req.body;

    if (!fecha_instalacion || !tarifa_mensual) {
      return res.status(400).json({ ok: false, mensaje: 'Fecha de instalación y tarifa son requeridos' });
    }

    const resultado = calcularCargosInstalacion(
      fecha_instalacion,
      parseFloat(tarifa_mensual),
      parseFloat(costo_instalacion) || 0,
      parseInt(dia_corte)
    );

    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('❌ Error calcularCargos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al calcular cargos' });
  }
}

// ========================================
// FUNCIÓN DE CÁLCULO (reutilizable)
// ========================================
function calcularCargosInstalacion(fechaInstalacion, tarifaMensual, costoInstalacion, diaCorte) {
  const fecha = new Date(fechaInstalacion + 'T12:00:00');
  const dia = fecha.getDate();
  const mes = fecha.getMonth();
  const anio = fecha.getFullYear();
  
  const nombresMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  
  const cargos = [];
  let totalAdeudo = 0;

  // 1. INSTALACIÓN
  if (costoInstalacion > 0) {
    cargos.push({
      tipo: 'instalacion',
      concepto: 'Costo de Instalación',
      monto: costoInstalacion,
      fecha_vencimiento: fechaInstalacion
    });
    totalAdeudo += costoInstalacion;
  }

  // 2. PRORRATEO (si instala ANTES del día de corte)
  if (dia < diaCorte) {
    const diasHastaCorte = diaCorte - dia;
    const costoPorDia = tarifaMensual / 30;
    const montoProrrateo = Math.round(diasHastaCorte * costoPorDia * 100) / 100;
    
    const fechaVencProrrateo = new Date(anio, mes, diaCorte);
    
    cargos.push({
      tipo: 'prorrateo',
      concepto: `Prorrateo ${diasHastaCorte} días (del ${dia} al ${diaCorte})`,
      descripcion: `$${costoPorDia.toFixed(2)} x ${diasHastaCorte} días`,
      monto: montoProrrateo,
      dias: diasHastaCorte,
      fecha_vencimiento: fechaVencProrrateo.toISOString().split('T')[0],
      mes_correspondiente: mes + 1,
      anio_correspondiente: anio
    });
    totalAdeudo += montoProrrateo;
  }

  // 3. PRIMERA MENSUALIDAD
  let mesMensualidad, anioMensualidad;
  
  if (dia < diaCorte) {
    // Si instaló antes del corte, la primera mensualidad completa es del MES SIGUIENTE
    mesMensualidad = mes + 1;
    anioMensualidad = anio;
    if (mesMensualidad > 11) {
      mesMensualidad = 0;
      anioMensualidad++;
    }
  } else {
    // Si instaló el día del corte o después, paga el mes actual completo
    mesMensualidad = mes;
    anioMensualidad = anio;
  }

  const fechaVencMensualidad = new Date(anioMensualidad, mesMensualidad, diaCorte);
  
  cargos.push({
    tipo: 'mensualidad',
    concepto: `Mensualidad ${nombresMeses[mesMensualidad]} ${anioMensualidad}`,
    monto: tarifaMensual,
    fecha_vencimiento: fechaVencMensualidad.toISOString().split('T')[0],
    mes_correspondiente: mesMensualidad + 1,
    anio_correspondiente: anioMensualidad
  });
  totalAdeudo += tarifaMensual;

  return {
    cargos,
    total_adeudo: Math.round(totalAdeudo * 100) / 100,
    resumen: {
      fecha_instalacion: fechaInstalacion,
      dia_corte: diaCorte,
      tarifa_mensual: tarifaMensual,
      costo_instalacion: costoInstalacion
    }
  };
}

// ========================================
// REGISTRAR INSTALACIÓN COMPLETA
// ========================================
async function registrarInstalacion(req, res) {
  const pool = obtenerPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      cliente_id,
      fecha_instalacion,
      tarifa_mensual,
      costo_instalacion = 0,
      dia_corte = 10,
      tecnico_instalador,
      notas_instalacion,
      // Equipo Antena
      antena_mac,
      antena_marca,
      antena_modelo,
      antena_ip,
      antena_ssid,
      // Equipo Router
      router_mac,
      router_marca,
      router_modelo,
      router_ip,
      router_serie,
      router_nombre_red,
      router_contrasena
    } = req.body;

    if (!cliente_id || !fecha_instalacion || !tarifa_mensual) {
      await connection.rollback();
      return res.status(400).json({ ok: false, mensaje: 'Cliente, fecha y tarifa son requeridos' });
    }

    console.log('📥 Registrando instalación para cliente:', cliente_id);

    // 1. ACTUALIZAR CLIENTE
    await connection.query(`
      UPDATE clientes SET 
        fecha_instalacion = ?,
        tarifa_mensual = ?,
        cuota_mensual = ?,
        costo_instalacion = ?,
        dia_corte = ?,
        tecnico_instalador = ?,
        notas_instalacion = ?
      WHERE id = ?
    `, [fecha_instalacion, tarifa_mensual, tarifa_mensual, costo_instalacion, dia_corte, tecnico_instalador || null, notas_instalacion || null, cliente_id]);

    // 2. CREAR REGISTRO EN TABLA INSTALACIONES
    const instalacionId = generarUUID();
    await connection.query(`
      INSERT INTO instalaciones (id, cliente_id, monto, fecha_instalacion, notas, creado_por)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [instalacionId, cliente_id, costo_instalacion, fecha_instalacion, notas_instalacion || null, req.usuario?.usuario_id || null]);

    // 3. REGISTRAR EQUIPOS
    const equiposRegistrados = [];
    
    // Antena
    if (antena_mac || antena_marca) {
      const antenaId = generarUUID();
      await connection.query(`
        INSERT INTO equipos (id, cliente_id, tipo, mac, marca, modelo, ip, ssid, fecha_instalacion)
        VALUES (?, ?, 'antena', ?, ?, ?, ?, ?, ?)
      `, [antenaId, cliente_id, antena_mac || null, antena_marca || null, antena_modelo || null, antena_ip || null, antena_ssid || null, fecha_instalacion]);
      equiposRegistrados.push({ tipo: 'antena', id: antenaId });
    }
    
    // Router
    if (router_mac || router_marca) {
      const routerId = generarUUID();
      await connection.query(`
        INSERT INTO equipos (id, cliente_id, tipo, mac, marca, modelo, ip, serie, nombre_red, contrasena_red, fecha_instalacion)
        VALUES (?, ?, 'router', ?, ?, ?, ?, ?, ?, ?, ?)
      `, [routerId, cliente_id, router_mac || null, router_marca || null, router_modelo || null, router_ip || null, router_serie || null, router_nombre_red || null, router_contrasena || null, fecha_instalacion]);
      equiposRegistrados.push({ tipo: 'router', id: routerId });
    }

    // 4. CALCULAR Y GENERAR CARGOS
    const calculo = calcularCargosInstalacion(
      fecha_instalacion,
      parseFloat(tarifa_mensual),
      parseFloat(costo_instalacion),
      parseInt(dia_corte)
    );

    const mensualidadesGeneradas = [];

    for (const cargo of calculo.cargos) {
      if (cargo.tipo === 'instalacion') {
        // Ya se registró en tabla instalaciones, actualizar estado
        await connection.query('UPDATE instalaciones SET estado = "pendiente" WHERE id = ?', [instalacionId]);
      } else {
        // Prorrateo o Mensualidad van a tabla mensualidades
        const mensualidadId = generarUUID();
        const esProrrateo = cargo.tipo === 'prorrateo' ? 1 : 0;
        
        // Calcular periodo (YYYY-MM)
        const periodo = `${cargo.anio_correspondiente}-${String(cargo.mes_correspondiente).padStart(2, '0')}`;
        
        // Fechas del periodo
        const fechaInicio = esProrrateo ? fecha_instalacion : `${cargo.anio_correspondiente}-${String(cargo.mes_correspondiente).padStart(2, '0')}-01`;
        const ultimoDia = new Date(cargo.anio_correspondiente, cargo.mes_correspondiente, 0).getDate();
        const fechaFin = `${cargo.anio_correspondiente}-${String(cargo.mes_correspondiente).padStart(2, '0')}-${ultimoDia}`;

        await connection.query(`
          INSERT INTO mensualidades (id, cliente_id, periodo, fecha_inicio, fecha_fin, fecha_vencimiento, monto, es_prorrateado, dias_prorrateados, estado)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')
        `, [
          mensualidadId, cliente_id, periodo, fechaInicio, fechaFin,
          cargo.fecha_vencimiento, cargo.monto, esProrrateo, cargo.dias || 0
        ]);

        mensualidadesGeneradas.push({
          id: mensualidadId,
          tipo: cargo.tipo,
          concepto: cargo.concepto,
          monto: cargo.monto
        });
      }
    }

    // 5. ACTUALIZAR SALDO PENDIENTE DEL CLIENTE
    await connection.query(`
      UPDATE clientes SET saldo_pendiente = ? WHERE id = ?
    `, [calculo.total_adeudo, cliente_id]);

    await connection.commit();

    console.log('✅ Instalación registrada:', {
      instalacion_id: instalacionId,
      equipos: equiposRegistrados.length,
      cargos: calculo.cargos.length,
      total: calculo.total_adeudo
    });

    res.json({
      ok: true,
      mensaje: 'Instalación registrada correctamente',
      instalacion: {
        id: instalacionId,
        cliente_id,
        fecha: fecha_instalacion
      },
      equipos: equiposRegistrados,
      cargos_generados: calculo.cargos,
      mensualidades: mensualidadesGeneradas,
      total_adeudo: calculo.total_adeudo
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
// OBTENER INSTALACIÓN DE UN CLIENTE
// ========================================
async function obtenerInstalacion(req, res) {
  try {
    const { cliente_id } = req.params;
    const pool = obtenerPool();

    // Instalación
    const [instalacion] = await pool.query(
      'SELECT * FROM instalaciones WHERE cliente_id = ? ORDER BY creado_en DESC LIMIT 1',
      [cliente_id]
    );

    // Equipos
    const [equipos] = await pool.query(
      'SELECT * FROM equipos WHERE cliente_id = ?',
      [cliente_id]
    );

    // Mensualidades
    const [mensualidades] = await pool.query(
      'SELECT * FROM mensualidades WHERE cliente_id = ? ORDER BY fecha_vencimiento ASC',
      [cliente_id]
    );

    res.json({
      ok: true,
      instalacion: instalacion[0] || null,
      equipos,
      mensualidades
    });
  } catch (err) {
    console.error('❌ Error obtenerInstalacion:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener instalación' });
  }
}

// ========================================
// LISTAR TODAS LAS INSTALACIONES
// ========================================
async function listarInstalaciones(req, res) {
  try {
    const { estado, desde, hasta } = req.query;
    const pool = obtenerPool();

    let sql = `
      SELECT i.*, 
             c.nombre, c.apellido_paterno, c.numero_cliente, c.telefono
      FROM instalaciones i
      INNER JOIN clientes c ON c.id = i.cliente_id
      WHERE 1=1
    `;
    const params = [];

    if (estado) {
      sql += ' AND i.estado = ?';
      params.push(estado);
    }

    if (desde) {
      sql += ' AND i.fecha_instalacion >= ?';
      params.push(desde);
    }

    if (hasta) {
      sql += ' AND i.fecha_instalacion <= ?';
      params.push(hasta);
    }

    sql += ' ORDER BY i.fecha_instalacion DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, instalaciones: rows });
  } catch (err) {
    console.error('❌ Error listarInstalaciones:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al listar instalaciones' });
  }
}

module.exports = {
  calcularCargos,
  registrarInstalacion,
  obtenerInstalacion,
  listarInstalaciones,
  calcularCargosInstalacion
};

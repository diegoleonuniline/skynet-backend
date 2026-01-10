const pool = require('../config/database');

// Obtener ID de catálogo por nombre
const getCatalogoId = async (tabla, nombre) => {
  const [rows] = await pool.query(
    `SELECT id FROM ${tabla} WHERE nombre = ? AND activo = 1`,
    [nombre]
  );
  return rows.length > 0 ? rows[0].id : null;
};

// Calcular días del mes
const diasEnMes = (mes, anio) => {
  return new Date(anio, mes, 0).getDate();
};

// Generar cargo de instalación
const generarCargoInstalacion = async (servicioId, monto, usuarioId) => {
  const tipoCargoId = await getCatalogoId('cat_tipos_cargo', 'Instalación');
  const estadoId = await getCatalogoId('cat_estados_cargo', 'Pendiente');
  const hoy = new Date();
  
  const [result] = await pool.query(
    `INSERT INTO cargos 
     (servicio_id, tipo_cargo_id, concepto, monto, saldo, fecha_emision, fecha_vencimiento, estado_id, created_by)
     VALUES (?, ?, 'Cargo por instalación', ?, ?, ?, ?, ?, ?)`,
    [servicioId, tipoCargoId, monto, monto, hoy, hoy, estadoId, usuarioId]
  );
  
  return result.insertId;
};

// Generar cargo de prorrateo
const generarCargoProrrateo = async (servicio, fechaInstalacion, usuarioId) => {
  const tipoCargoId = await getCatalogoId('cat_tipos_cargo', 'Prorrateo');
  const estadoId = await getCatalogoId('cat_estados_cargo', 'Pendiente');
  
  const fecha = new Date(fechaInstalacion);
  const diaInstalacion = fecha.getDate();
  const mes = fecha.getMonth() + 1;
  const anio = fecha.getFullYear();
  const diaCorte = servicio.dia_corte || 10;
  
  // Si se instala en o después del día de corte, no hay prorrateo
  if (diaInstalacion >= diaCorte) {
    return null;
  }
  
  // Calcular días a cobrar (desde instalación hasta día de corte)
  const diasACobrar = diaCorte - diaInstalacion;
  const totalDiasMes = diasEnMes(mes, anio);
  const precioDiario = servicio.precio_mensual / totalDiasMes;
  const montoProrrateo = Math.round(precioDiario * diasACobrar * 100) / 100;
  
  const fechaVencimiento = new Date(anio, mes - 1, diaCorte);
  
  const [result] = await pool.query(
    `INSERT INTO cargos 
     (servicio_id, tipo_cargo_id, concepto, monto, saldo, fecha_emision, fecha_vencimiento, periodo_mes, periodo_anio, estado_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      servicio.id,
      tipoCargoId,
      `Prorrateo ${diasACobrar} días (${diaInstalacion} al ${diaCorte} de ${mes}/${anio})`,
      montoProrrateo,
      montoProrrateo,
      fechaInstalacion,
      fechaVencimiento,
      mes,
      anio,
      estadoId,
      usuarioId
    ]
  );
  
  return result.insertId;
};

// Generar cargo de mensualidad
const generarCargoMensualidad = async (servicio, mes, anio, usuarioId) => {
  const tipoCargoId = await getCatalogoId('cat_tipos_cargo', 'Mensualidad');
  const estadoId = await getCatalogoId('cat_estados_cargo', 'Pendiente');
  const diaCorte = servicio.dia_corte || 10;
  
  // Verificar que no exista ya el cargo para ese periodo
  const [existente] = await pool.query(
    `SELECT id FROM cargos 
     WHERE servicio_id = ? AND tipo_cargo_id = ? AND periodo_mes = ? AND periodo_anio = ? AND activo = 1`,
    [servicio.id, tipoCargoId, mes, anio]
  );
  
  if (existente.length > 0) {
    return null;
  }
  
  const fechaEmision = new Date(anio, mes - 1, diaCorte);
  const fechaVencimiento = new Date(anio, mes - 1, diaCorte);
  
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  const [result] = await pool.query(
    `INSERT INTO cargos 
     (servicio_id, tipo_cargo_id, concepto, monto, saldo, fecha_emision, fecha_vencimiento, periodo_mes, periodo_anio, estado_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      servicio.id,
      tipoCargoId,
      `Mensualidad ${meses[mes - 1]} ${anio}`,
      servicio.precio_mensual,
      servicio.precio_mensual,
      fechaEmision,
      fechaVencimiento,
      mes,
      anio,
      estadoId,
      usuarioId
    ]
  );
  
  return result.insertId;
};

// Obtener cargos pendientes de un cliente
const obtenerCargosPendientes = async (clienteId) => {
  const [cargos] = await pool.query(
    `SELECT c.*, tc.nombre as tipo_cargo, ec.nombre as estado,
            s.precio_mensual, cl.nombre as cliente_nombre
     FROM cargos c
     JOIN servicios s ON c.servicio_id = s.id
     JOIN clientes cl ON s.cliente_id = cl.id
     JOIN cat_tipos_cargo tc ON c.tipo_cargo_id = tc.id
     JOIN cat_estados_cargo ec ON c.estado_id = ec.id
     WHERE cl.id = ? AND c.saldo > 0 AND c.activo = 1
     ORDER BY c.fecha_vencimiento ASC`,
    [clienteId]
  );
  return cargos;
};

// Obtener total adeudo de un cliente
const obtenerAdeudoCliente = async (clienteId) => {
  const [result] = await pool.query(
    `SELECT COALESCE(SUM(c.saldo), 0) as total_adeudo
     FROM cargos c
     JOIN servicios s ON c.servicio_id = s.id
     WHERE s.cliente_id = ? AND c.saldo > 0 AND c.activo = 1`,
    [clienteId]
  );
  return result[0].total_adeudo;
};

// Actualizar estado de cargo según saldo
const actualizarEstadoCargo = async (cargoId) => {
  const [cargo] = await pool.query('SELECT monto, saldo FROM cargos WHERE id = ?', [cargoId]);
  
  if (cargo.length === 0) return;
  
  let nuevoEstadoNombre;
  if (cargo[0].saldo <= 0) {
    nuevoEstadoNombre = 'Pagado';
  } else if (cargo[0].saldo < cargo[0].monto) {
    nuevoEstadoNombre = 'Parcial';
  } else {
    nuevoEstadoNombre = 'Pendiente';
  }
  
  const estadoId = await getCatalogoId('cat_estados_cargo', nuevoEstadoNombre);
  await pool.query('UPDATE cargos SET estado_id = ? WHERE id = ?', [estadoId, cargoId]);
};

module.exports = {
  generarCargoInstalacion,
  generarCargoProrrateo,
  generarCargoMensualidad,
  obtenerCargosPendientes,
  obtenerAdeudoCliente,
  actualizarEstadoCargo,
  getCatalogoId
};

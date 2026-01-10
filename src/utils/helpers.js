const db = require('../config/database');

// Registrar cambio en historial
const registrarCambio = async (tabla, registroId, campo, valorAnterior, valorNuevo, accion, userId, ip = null, userAgent = null) => {
    try {
        await db.query(
            `INSERT INTO historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, accion, ip_address, user_agent, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tabla, registroId, campo, valorAnterior, valorNuevo, accion, ip, userAgent, userId]
        );
    } catch (error) {
        console.error('Error registrando historial:', error);
    }
};

// Registrar múltiples cambios
const registrarCambiosMultiples = async (tabla, registroId, cambios, accion, userId, ip = null, userAgent = null) => {
    const conn = await db.getConnection();
    try {
        for (const cambio of cambios) {
            await conn.query(
                `INSERT INTO historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, accion, ip_address, user_agent, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [tabla, registroId, cambio.campo, cambio.anterior, cambio.nuevo, accion, ip, userAgent, userId]
            );
        }
    } finally {
        conn.release();
    }
};

// Log de actividad
const logActividad = async (userId, accion, modulo, descripcion, ip = null, userAgent = null) => {
    try {
        await db.query(
            `INSERT INTO log_actividad (usuario_id, accion, modulo, descripcion, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, accion, modulo, descripcion, ip, userAgent]
        );
    } catch (error) {
        console.error('Error registrando actividad:', error);
    }
};

// Generar código único
const generarCodigo = async (tabla, prefijo, campo = 'codigo') => {
    const [result] = await db.query(
        `SELECT MAX(CAST(SUBSTRING(${campo}, ?) AS UNSIGNED)) as ultimo FROM ${tabla}`,
        [prefijo.length + 1]
    );
    const siguiente = (result[0].ultimo || 0) + 1;
    return `${prefijo}${String(siguiente).padStart(6, '0')}`;
};

// Calcular prorrateo
const calcularProrrateo = (tarifa, fechaInicio, diaCorte = 10) => {
    const fecha = new Date(fechaInicio);
    const dia = fecha.getDate();
    
    if (dia === diaCorte) {
        return { prorrateo: 0, diasProrrateo: 0 };
    }

    let diasProrrateo;
    if (dia < diaCorte) {
        diasProrrateo = diaCorte - dia;
    } else {
        const ultimoDiaMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
        diasProrrateo = (ultimoDiaMes - dia) + diaCorte;
    }

    const tarifaDiaria = tarifa / 30;
    const prorrateo = Math.round(tarifaDiaria * diasProrrateo * 100) / 100;

    return { prorrateo, diasProrrateo };
};

// Calcular fecha de vencimiento
const calcularFechaVencimiento = (fechaInicio, diaCorte = 10) => {
    const fecha = new Date(fechaInicio);
    const dia = fecha.getDate();

    let vencimiento;
    if (dia <= diaCorte) {
        vencimiento = new Date(fecha.getFullYear(), fecha.getMonth(), diaCorte);
    } else {
        vencimiento = new Date(fecha.getFullYear(), fecha.getMonth() + 1, diaCorte);
    }

    return vencimiento.toISOString().split('T')[0];
};

// Obtener IP del request
const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || null;
};

// Formatear fecha para MySQL
const formatDateMySQL = (date) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toISOString().slice(0, 19).replace('T', ' ');
};

// Paginación
const paginate = (page = 1, limit = 20) => {
    const offset = (page - 1) * limit;
    return { limit: parseInt(limit), offset };
};

// Response helper
const response = {
    success: (res, data, message = 'Operación exitosa', status = 200) => {
        res.status(status).json({ success: true, message, data });
    },
    error: (res, message = 'Error', status = 400, errors = null) => {
        const response = { success: false, message };
        if (errors) response.errors = errors;
        res.status(status).json(response);
    },
    paginated: (res, data, total, page, limit, message = 'Datos obtenidos') => {
        res.json({
            success: true,
            message,
            data,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    }
};

module.exports = {
    registrarCambio,
    registrarCambiosMultiples,
    logActividad,
    generarCodigo,
    calcularProrrateo,
    calcularFechaVencimiento,
    getClientIp,
    formatDateMySQL,
    paginate,
    response
};

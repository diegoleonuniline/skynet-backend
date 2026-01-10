const db = require('../config/database');
const { paginate, response } = require('../utils/helpers');

const adeudos = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, dias_vencido, zona_id, ciudad_id } = req.query;
        const { limit: lim, offset } = paginate(page, limit);

        let where = `WHERE ca.estatus IN ('PENDIENTE', 'PARCIAL') AND ca.is_active = 1 AND ca.fecha_vencimiento < CURDATE()`;
        const params = [];

        if (dias_vencido) {
            where += ` AND DATEDIFF(CURDATE(), ca.fecha_vencimiento) >= ?`;
            params.push(dias_vencido);
        }
        if (zona_id) {
            where += ` AND c.zona_id = ?`;
            params.push(zona_id);
        }
        if (ciudad_id) {
            where += ` AND c.ciudad_id = ?`;
            params.push(ciudad_id);
        }

        const [total] = await db.query(
            `SELECT COUNT(DISTINCT c.id) as total 
             FROM cargos ca
             JOIN servicios s ON ca.servicio_id = s.id
             JOIN clientes c ON s.cliente_id = c.id
             ${where}`,
            params
        );

        const [data] = await db.query(
            `SELECT c.id, c.codigo, c.nombre, c.apellido_paterno, c.apellido_materno, c.telefono1,
                    c.calle, c.numero_exterior, ci.nombre as ciudad, z.nombre as zona,
                    SUM(ca.saldo_pendiente) as total_adeudo,
                    MIN(ca.fecha_vencimiento) as fecha_vencimiento_mas_antiguo,
                    MAX(DATEDIFF(CURDATE(), ca.fecha_vencimiento)) as dias_vencido_max,
                    COUNT(ca.id) as cargos_pendientes
             FROM cargos ca
             JOIN servicios s ON ca.servicio_id = s.id
             JOIN clientes c ON s.cliente_id = c.id
             LEFT JOIN cat_ciudades ci ON c.ciudad_id = ci.id
             LEFT JOIN cat_zonas z ON c.zona_id = z.id
             ${where}
             GROUP BY c.id
             ORDER BY total_adeudo DESC
             LIMIT ? OFFSET ?`,
            [...params, lim, offset]
        );

        const [resumen] = await db.query(
            `SELECT SUM(ca.saldo_pendiente) as total_cartera_vencida, COUNT(DISTINCT c.id) as clientes_con_adeudo
             FROM cargos ca
             JOIN servicios s ON ca.servicio_id = s.id
             JOIN clientes c ON s.cliente_id = c.id
             ${where}`,
            params
        );

        response.paginated(res, { data, resumen: resumen[0] }, total[0].total, page, limit);
    } catch (error) {
        next(error);
    }
};

const clientesPorCiudad = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT ci.id, ci.nombre as ciudad, e.nombre as estado,
                    COUNT(c.id) as total_clientes,
                    SUM(CASE WHEN ec.clave = 'ACTIVO' THEN 1 ELSE 0 END) as activos,
                    SUM(CASE WHEN ec.clave = 'CANCELADO' THEN 1 ELSE 0 END) as cancelados
             FROM cat_ciudades ci
             LEFT JOIN cat_estados e ON ci.estado_id = e.id
             LEFT JOIN clientes c ON c.ciudad_id = ci.id AND c.deleted_at IS NULL
             LEFT JOIN cat_estatus_cliente ec ON c.estatus_id = ec.id
             WHERE ci.is_active = 1
             GROUP BY ci.id
             ORDER BY total_clientes DESC`
        );

        response.success(res, data);
    } catch (error) {
        next(error);
    }
};

const clientesPorZona = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT z.id, z.nombre as zona,
                    COUNT(c.id) as total_clientes,
                    SUM(CASE WHEN ec.clave = 'ACTIVO' THEN 1 ELSE 0 END) as activos,
                    SUM(CASE WHEN ec.clave = 'CANCELADO' THEN 1 ELSE 0 END) as cancelados
             FROM cat_zonas z
             LEFT JOIN clientes c ON c.zona_id = z.id AND c.deleted_at IS NULL
             LEFT JOIN cat_estatus_cliente ec ON c.estatus_id = ec.id
             WHERE z.is_active = 1
             GROUP BY z.id
             ORDER BY total_clientes DESC`
        );

        response.success(res, data);
    } catch (error) {
        next(error);
    }
};

const clientesPorCalle = async (req, res, next) => {
    try {
        const { ciudad_id, zona_id } = req.query;

        let where = 'WHERE c.deleted_at IS NULL AND c.calle IS NOT NULL';
        const params = [];

        if (ciudad_id) {
            where += ` AND c.ciudad_id = ?`;
            params.push(ciudad_id);
        }
        if (zona_id) {
            where += ` AND c.zona_id = ?`;
            params.push(zona_id);
        }

        const [data] = await db.query(
            `SELECT c.calle, ci.nombre as ciudad,
                    COUNT(c.id) as total_clientes,
                    GROUP_CONCAT(DISTINCT c.numero_exterior ORDER BY c.numero_exterior) as numeros
             FROM clientes c
             LEFT JOIN cat_ciudades ci ON c.ciudad_id = ci.id
             ${where}
             GROUP BY c.calle, c.ciudad_id
             ORDER BY total_clientes DESC`,
            params
        );

        response.success(res, data);
    } catch (error) {
        next(error);
    }
};

const ingresos = async (req, res, next) => {
    try {
        const { fecha_desde, fecha_hasta, agrupar = 'dia' } = req.query;

        let groupBy, selectDate;
        switch (agrupar) {
            case 'mes':
                groupBy = 'YEAR(p.fecha_pago), MONTH(p.fecha_pago)';
                selectDate = `DATE_FORMAT(p.fecha_pago, '%Y-%m') as periodo`;
                break;
            case 'semana':
                groupBy = 'YEAR(p.fecha_pago), WEEK(p.fecha_pago)';
                selectDate = `CONCAT(YEAR(p.fecha_pago), '-W', LPAD(WEEK(p.fecha_pago), 2, '0')) as periodo`;
                break;
            default:
                groupBy = 'DATE(p.fecha_pago)';
                selectDate = `DATE(p.fecha_pago) as periodo`;
        }

        let where = `WHERE p.estatus = 'APLICADO' AND p.is_active = 1`;
        const params = [];

        if (fecha_desde) {
            where += ` AND DATE(p.fecha_pago) >= ?`;
            params.push(fecha_desde);
        }
        if (fecha_hasta) {
            where += ` AND DATE(p.fecha_pago) <= ?`;
            params.push(fecha_hasta);
        }

        const [data] = await db.query(
            `SELECT ${selectDate}, 
                    COUNT(p.id) as total_pagos,
                    SUM(p.monto_total) as total_ingresos,
                    AVG(p.monto_total) as promedio_pago
             FROM pagos p
             ${where}
             GROUP BY ${groupBy}
             ORDER BY periodo DESC`,
            params
        );

        const [resumen] = await db.query(
            `SELECT COUNT(p.id) as total_pagos, SUM(p.monto_total) as total_ingresos
             FROM pagos p ${where}`,
            params
        );

        response.success(res, { data, resumen: resumen[0] });
    } catch (error) {
        next(error);
    }
};

const cobranza = async (req, res, next) => {
    try {
        const { mes, anio } = req.query;

        const mesActual = mes || new Date().getMonth() + 1;
        const anioActual = anio || new Date().getFullYear();

        const [esperado] = await db.query(
            `SELECT SUM(monto) as total_esperado, COUNT(*) as total_cargos
             FROM cargos 
             WHERE periodo_mes = ? AND periodo_anio = ? AND is_active = 1 AND estatus != 'CANCELADO'`,
            [mesActual, anioActual]
        );

        const [cobrado] = await db.query(
            `SELECT SUM(pd.monto_aplicado) as total_cobrado
             FROM pago_detalles pd
             JOIN cargos ca ON pd.cargo_id = ca.id
             WHERE ca.periodo_mes = ? AND ca.periodo_anio = ? AND pd.is_active = 1`,
            [mesActual, anioActual]
        );

        const [pendiente] = await db.query(
            `SELECT SUM(saldo_pendiente) as total_pendiente, COUNT(*) as cargos_pendientes
             FROM cargos 
             WHERE periodo_mes = ? AND periodo_anio = ? AND estatus IN ('PENDIENTE', 'PARCIAL') AND is_active = 1`,
            [mesActual, anioActual]
        );

        const totalEsperado = esperado[0].total_esperado || 0;
        const totalCobrado = cobrado[0].total_cobrado || 0;
        const porcentajeCobranza = totalEsperado > 0 ? (totalCobrado / totalEsperado * 100).toFixed(2) : 0;

        response.success(res, {
            mes: mesActual,
            anio: anioActual,
            total_esperado: totalEsperado,
            total_cobrado: totalCobrado,
            total_pendiente: pendiente[0].total_pendiente || 0,
            cargos_pendientes: pendiente[0].cargos_pendientes || 0,
            porcentaje_cobranza: parseFloat(porcentajeCobranza)
        });
    } catch (error) {
        next(error);
    }
};

const altasBajas = async (req, res, next) => {
    try {
        const { fecha_desde, fecha_hasta } = req.query;

        let whereAltas = 'WHERE c.deleted_at IS NULL';
        let whereBajas = `WHERE c.deleted_at IS NULL AND ec.clave = 'CANCELADO'`;
        const paramsAltas = [];
        const paramsBajas = [];

        if (fecha_desde) {
            whereAltas += ` AND DATE(c.created_at) >= ?`;
            whereBajas += ` AND c.fecha_cancelacion >= ?`;
            paramsAltas.push(fecha_desde);
            paramsBajas.push(fecha_desde);
        }
        if (fecha_hasta) {
            whereAltas += ` AND DATE(c.created_at) <= ?`;
            whereBajas += ` AND c.fecha_cancelacion <= ?`;
            paramsAltas.push(fecha_hasta);
            paramsBajas.push(fecha_hasta);
        }

        const [altas] = await db.query(
            `SELECT COUNT(*) as total FROM clientes c ${whereAltas}`,
            paramsAltas
        );

        const [bajas] = await db.query(
            `SELECT COUNT(*) as total FROM clientes c
             JOIN cat_estatus_cliente ec ON c.estatus_id = ec.id
             ${whereBajas}`,
            paramsBajas
        );

        const [totalActivos] = await db.query(
            `SELECT COUNT(*) as total FROM clientes c
             JOIN cat_estatus_cliente ec ON c.estatus_id = ec.id
             WHERE ec.clave = 'ACTIVO' AND c.deleted_at IS NULL`
        );

        const [totalCancelados] = await db.query(
            `SELECT COUNT(*) as total FROM clientes c
             JOIN cat_estatus_cliente ec ON c.estatus_id = ec.id
             WHERE ec.clave = 'CANCELADO' AND c.deleted_at IS NULL`
        );

        response.success(res, {
            altas_periodo: altas[0].total,
            bajas_periodo: bajas[0].total,
            neto: altas[0].total - bajas[0].total,
            total_activos: totalActivos[0].total,
            total_cancelados: totalCancelados[0].total,
            total_clientes: totalActivos[0].total + totalCancelados[0].total
        });
    } catch (error) {
        next(error);
    }
};

const serviciosPorTarifa = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT t.id, t.nombre as tarifa, t.monto, t.velocidad_mbps,
                    COUNT(s.id) as total_servicios,
                    SUM(CASE WHEN es.clave = 'ACTIVO' THEN 1 ELSE 0 END) as activos
             FROM cat_tarifas t
             LEFT JOIN servicios s ON s.tarifa_id = t.id AND s.deleted_at IS NULL
             LEFT JOIN cat_estatus_servicio es ON s.estatus_id = es.id
             WHERE t.is_active = 1
             GROUP BY t.id
             ORDER BY t.monto`
        );

        const [ingresoMensualEstimado] = await db.query(
            `SELECT SUM(t.monto) as total
             FROM servicios s
             JOIN cat_tarifas t ON s.tarifa_id = t.id
             JOIN cat_estatus_servicio es ON s.estatus_id = es.id
             WHERE es.clave = 'ACTIVO' AND s.deleted_at IS NULL`
        );

        response.success(res, { data, ingreso_mensual_estimado: ingresoMensualEstimado[0].total || 0 });
    } catch (error) {
        next(error);
    }
};

const equipos = async (req, res, next) => {
    try {
        const { tipo_equipo_id, marca_id } = req.query;

        let where = 'WHERE se.is_active = 1 AND se.deleted_at IS NULL';
        const params = [];

        if (tipo_equipo_id) {
            where += ` AND se.tipo_equipo_id = ?`;
            params.push(tipo_equipo_id);
        }
        if (marca_id) {
            where += ` AND se.marca_id = ?`;
            params.push(marca_id);
        }

        const [data] = await db.query(
            `SELECT te.nombre as tipo, m.nombre as marca, mo.nombre as modelo,
                    COUNT(se.id) as total_equipos
             FROM servicio_equipos se
             LEFT JOIN cat_tipo_equipo te ON se.tipo_equipo_id = te.id
             LEFT JOIN cat_marcas_equipo m ON se.marca_id = m.id
             LEFT JOIN cat_modelos_equipo mo ON se.modelo_id = mo.id
             ${where}
             GROUP BY se.tipo_equipo_id, se.marca_id, se.modelo_id
             ORDER BY total_equipos DESC`,
            params
        );

        response.success(res, data);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    adeudos, clientesPorCiudad, clientesPorZona, clientesPorCalle,
    ingresos, cobranza, altasBajas, serviciosPorTarifa, equipos
};

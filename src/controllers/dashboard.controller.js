const db = require('../config/database');
const { response } = require('../utils/helpers');

const resumen = async (req, res, next) => {
    try {
        const [clientesActivos] = await db.query(
            `SELECT COUNT(*) as total FROM clientes c
             JOIN cat_estatus_cliente ec ON c.estatus_id = ec.id
             WHERE ec.clave = 'ACTIVO' AND c.deleted_at IS NULL`
        );

        const [serviciosActivos] = await db.query(
            `SELECT COUNT(*) as total FROM servicios s
             JOIN cat_estatus_servicio es ON s.estatus_id = es.id
             WHERE es.clave = 'ACTIVO' AND s.deleted_at IS NULL`
        );

        const [ingresosMes] = await db.query(
            `SELECT COALESCE(SUM(monto_total), 0) as total FROM pagos
             WHERE estatus = 'APLICADO' AND MONTH(fecha_pago) = MONTH(CURDATE()) AND YEAR(fecha_pago) = YEAR(CURDATE())`
        );

        const [carteraVencida] = await db.query(
            `SELECT COALESCE(SUM(saldo_pendiente), 0) as total FROM cargos
             WHERE estatus IN ('PENDIENTE', 'PARCIAL') AND fecha_vencimiento < CURDATE() AND is_active = 1`
        );

        const [clientesSuspendidos] = await db.query(
            `SELECT COUNT(*) as total FROM servicios s
             JOIN cat_estatus_servicio es ON s.estatus_id = es.id
             WHERE es.clave = 'SUSPENDIDO' AND s.deleted_at IS NULL`
        );

        const [ingresoEsperado] = await db.query(
            `SELECT COALESCE(SUM(t.monto), 0) as total
             FROM servicios s
             JOIN cat_tarifas t ON s.tarifa_id = t.id
             JOIN cat_estatus_servicio es ON s.estatus_id = es.id
             WHERE es.clave = 'ACTIVO' AND s.deleted_at IS NULL`
        );

        const [pagosHoy] = await db.query(
            `SELECT COUNT(*) as cantidad, COALESCE(SUM(monto_total), 0) as monto FROM pagos
             WHERE estatus = 'APLICADO' AND DATE(fecha_pago) = CURDATE()`
        );

        const [clientesNuevosMes] = await db.query(
            `SELECT COUNT(*) as total FROM clientes
             WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) AND deleted_at IS NULL`
        );

        response.success(res, {
            clientes_activos: clientesActivos[0].total,
            servicios_activos: serviciosActivos[0].total,
            ingresos_mes: ingresosMes[0].total,
            cartera_vencida: carteraVencida[0].total,
            servicios_suspendidos: clientesSuspendidos[0].total,
            ingreso_esperado_mensual: ingresoEsperado[0].total,
            pagos_hoy: pagosHoy[0],
            clientes_nuevos_mes: clientesNuevosMes[0].total
        });
    } catch (error) {
        next(error);
    }
};

const graficoIngresos = async (req, res, next) => {
    try {
        const { meses = 6 } = req.query;

        const [data] = await db.query(
            `SELECT DATE_FORMAT(fecha_pago, '%Y-%m') as mes,
                    COALESCE(SUM(monto_total), 0) as ingresos,
                    COUNT(*) as pagos
             FROM pagos
             WHERE estatus = 'APLICADO' AND fecha_pago >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
             GROUP BY DATE_FORMAT(fecha_pago, '%Y-%m')
             ORDER BY mes`,
            [meses]
        );

        response.success(res, data);
    } catch (error) {
        next(error);
    }
};

const graficoServicios = async (req, res, next) => {
    try {
        const [porEstatus] = await db.query(
            `SELECT es.nombre as estatus, es.color, COUNT(s.id) as total
             FROM cat_estatus_servicio es
             LEFT JOIN servicios s ON s.estatus_id = es.id AND s.deleted_at IS NULL
             WHERE es.is_active = 1
             GROUP BY es.id`
        );

        const [porTarifa] = await db.query(
            `SELECT t.nombre as tarifa, t.monto, COUNT(s.id) as total
             FROM cat_tarifas t
             LEFT JOIN servicios s ON s.tarifa_id = t.id AND s.deleted_at IS NULL
             JOIN cat_estatus_servicio es ON s.estatus_id = es.id AND es.clave = 'ACTIVO'
             WHERE t.is_active = 1
             GROUP BY t.id
             ORDER BY t.monto`
        );

        response.success(res, { por_estatus: porEstatus, por_tarifa: porTarifa });
    } catch (error) {
        next(error);
    }
};

const proximosVencer = async (req, res, next) => {
    try {
        const { dias = 5 } = req.query;

        const [data] = await db.query(
            `SELECT ca.id, ca.monto, ca.saldo_pendiente, ca.fecha_vencimiento,
                    cc.nombre as concepto, s.codigo as servicio_codigo,
                    c.id as cliente_id, c.codigo as cliente_codigo, c.nombre as cliente_nombre,
                    c.apellido_paterno, c.telefono1,
                    DATEDIFF(ca.fecha_vencimiento, CURDATE()) as dias_para_vencer
             FROM cargos ca
             JOIN cat_conceptos_cobro cc ON ca.concepto_id = cc.id
             JOIN servicios s ON ca.servicio_id = s.id
             JOIN clientes c ON s.cliente_id = c.id
             WHERE ca.estatus IN ('PENDIENTE', 'PARCIAL') AND ca.is_active = 1
               AND ca.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
             ORDER BY ca.fecha_vencimiento
             LIMIT 20`,
            [dias]
        );

        response.success(res, data);
    } catch (error) {
        next(error);
    }
};

const actividadReciente = async (req, res, next) => {
    try {
        const { limite = 15 } = req.query;

        const [data] = await db.query(
            `SELECT la.*, u.nombre as usuario_nombre
             FROM log_actividad la
             LEFT JOIN usuarios u ON la.usuario_id = u.id
             ORDER BY la.created_at DESC
             LIMIT ?`,
            [parseInt(limite)]
        );

        response.success(res, data);
    } catch (error) {
        next(error);
    }
};

module.exports = { resumen, graficoIngresos, graficoServicios, proximosVencer, actividadReciente };

const pool = require('../config/database');

const reportesController = {
    // Clientes con adeudo
    async clientesConAdeudo(req, res) {
        try {
            const { ciudad_id, colonia_id, dias_vencido, orden = 'adeudo_desc' } = req.query;

            let query = `
                SELECT 
                    c.id,
                    c.numero_cliente,
                    CONCAT(c.nombre, ' ', c.apellido_paterno, ' ', IFNULL(c.apellido_materno, '')) as nombre_completo,
                    c.telefono_principal,
                    col.nombre as colonia,
                    ciu.nombre as ciudad,
                    COALESCE(SUM(car.saldo), 0) as adeudo_total,
                    MIN(car.fecha_vencimiento) as vencimiento_mas_antiguo,
                    DATEDIFF(CURDATE(), MIN(car.fecha_vencimiento)) as dias_vencido,
                    COUNT(DISTINCT car.id) as cargos_pendientes
                FROM clientes c
                LEFT JOIN cat_colonias col ON c.colonia_id = col.id
                LEFT JOIN cat_ciudades ciu ON col.ciudad_id = ciu.id
                INNER JOIN servicios s ON s.cliente_id = c.id
                INNER JOIN cargos car ON car.servicio_id = s.id
                INNER JOIN cat_estados_cargo ec ON car.estado_id = ec.id
                WHERE ec.nombre IN ('Pendiente', 'Parcial')
                AND car.saldo > 0
                AND car.fecha_vencimiento < CURDATE()
            `;

            const params = [];

            if (ciudad_id) {
                query += ` AND ciu.id = ?`;
                params.push(ciudad_id);
            }

            if (colonia_id) {
                query += ` AND col.id = ?`;
                params.push(colonia_id);
            }

            query += ` GROUP BY c.id`;

            if (dias_vencido) {
                query += ` HAVING dias_vencido >= ?`;
                params.push(parseInt(dias_vencido));
            }

            switch (orden) {
                case 'adeudo_asc':
                    query += ` ORDER BY adeudo_total ASC`;
                    break;
                case 'dias_desc':
                    query += ` ORDER BY dias_vencido DESC`;
                    break;
                case 'dias_asc':
                    query += ` ORDER BY dias_vencido ASC`;
                    break;
                default:
                    query += ` ORDER BY adeudo_total DESC`;
            }

            const [clientes] = await pool.query(query, params);

            const [totales] = await pool.query(`
                SELECT 
                    COUNT(DISTINCT c.id) as total_clientes,
                    COALESCE(SUM(car.saldo), 0) as total_adeudo
                FROM clientes c
                INNER JOIN servicios s ON s.cliente_id = c.id
                INNER JOIN cargos car ON car.servicio_id = s.id
                INNER JOIN cat_estados_cargo ec ON car.estado_id = ec.id
                WHERE ec.nombre IN ('Pendiente', 'Parcial')
                AND car.saldo > 0
                AND car.fecha_vencimiento < CURDATE()
            `);

            res.json({
                ok: true,
                data: {
                    clientes,
                    resumen: totales[0]
                }
            });
        } catch (error) {
            console.error('Error en reporte clientes con adeudo:', error);
            res.status(500).json({ ok: false, mensaje: 'Error al generar reporte' });
        }
    },

    // Clientes activos vs cancelados
    async clientesEstado(req, res) {
        try {
            const { ciudad_id, colonia_id, fecha_desde, fecha_hasta } = req.query;

            let whereClause = '1=1';
            const params = [];

            if (ciudad_id) {
                whereClause += ` AND ciu.id = ?`;
                params.push(ciudad_id);
            }

            if (colonia_id) {
                whereClause += ` AND col.id = ?`;
                params.push(colonia_id);
            }

            // Resumen general
            const [resumen] = await pool.query(`
                SELECT 
                    ec.nombre as estado,
                    COUNT(c.id) as cantidad
                FROM clientes c
                INNER JOIN cat_estados_cliente ec ON c.estado_id = ec.id
                LEFT JOIN cat_colonias col ON c.colonia_id = col.id
                LEFT JOIN cat_ciudades ciu ON col.ciudad_id = ciu.id
                WHERE ${whereClause}
                GROUP BY ec.id, ec.nombre
            `, params);

            // Servicios activos vs cancelados
            const [servicios] = await pool.query(`
                SELECT 
                    es.nombre as estado,
                    COUNT(s.id) as cantidad,
                    COALESCE(SUM(s.precio_mensual), 0) as ingreso_mensual_potencial
                FROM servicios s
                INNER JOIN cat_estados_servicio es ON s.estado_id = es.id
                INNER JOIN clientes c ON s.cliente_id = c.id
                LEFT JOIN cat_colonias col ON c.colonia_id = col.id
                LEFT JOIN cat_ciudades ciu ON col.ciudad_id = ciu.id
                WHERE ${whereClause}
                GROUP BY es.id, es.nombre
            `, params);

            // Tendencia de cancelaciones
            let tendenciaQuery = `
                SELECT 
                    DATE_FORMAT(s.fecha_cancelacion, '%Y-%m') as mes,
                    COUNT(*) as cancelaciones
                FROM servicios s
                INNER JOIN clientes c ON s.cliente_id = c.id
                LEFT JOIN cat_colonias col ON c.colonia_id = col.id
                LEFT JOIN cat_ciudades ciu ON col.ciudad_id = ciu.id
                WHERE s.fecha_cancelacion IS NOT NULL
                AND ${whereClause}
            `;

            const tendenciaParams = [...params];

            if (fecha_desde) {
                tendenciaQuery += ` AND s.fecha_cancelacion >= ?`;
                tendenciaParams.push(fecha_desde);
            }

            if (fecha_hasta) {
                tendenciaQuery += ` AND s.fecha_cancelacion <= ?`;
                tendenciaParams.push(fecha_hasta);
            }

            tendenciaQuery += ` GROUP BY DATE_FORMAT(s.fecha_cancelacion, '%Y-%m') ORDER BY mes DESC LIMIT 12`;

            const [tendencia] = await pool.query(tendenciaQuery, tendenciaParams);

            res.json({
                ok: true,
                data: {
                    clientes: resumen,
                    servicios,
                    tendencia_cancelaciones: tendencia
                }
            });
        } catch (error) {
            console.error('Error en reporte estado clientes:', error);
            res.status(500).json({ ok: false, mensaje: 'Error al generar reporte' });
        }
    },

    // Clientes por ciudad/colonia
    async clientesPorUbicacion(req, res) {
        try {
            // Por ciudad
            const [porCiudad] = await pool.query(`
                SELECT 
                    ciu.id as ciudad_id,
                    ciu.nombre as ciudad,
                    COUNT(DISTINCT c.id) as total_clientes,
                    COUNT(DISTINCT CASE WHEN ec.nombre = 'Activo' THEN c.id END) as clientes_activos,
                    COUNT(DISTINCT s.id) as total_servicios,
                    COUNT(DISTINCT CASE WHEN es.nombre = 'Activo' THEN s.id END) as servicios_activos,
                    COALESCE(SUM(CASE WHEN es.nombre = 'Activo' THEN s.precio_mensual ELSE 0 END), 0) as ingreso_mensual
                FROM cat_ciudades ciu
                LEFT JOIN cat_colonias col ON col.ciudad_id = ciu.id
                LEFT JOIN clientes c ON c.colonia_id = col.id
                LEFT JOIN cat_estados_cliente ec ON c.estado_id = ec.id
                LEFT JOIN servicios s ON s.cliente_id = c.id
                LEFT JOIN cat_estados_servicio es ON s.estado_id = es.id
                WHERE ciu.activo = 1
                GROUP BY ciu.id, ciu.nombre
                ORDER BY total_clientes DESC
            `);

            // Por colonia (top 20)
            const [porColonia] = await pool.query(`
                SELECT 
                    col.id as colonia_id,
                    col.nombre as colonia,
                    ciu.nombre as ciudad,
                    COUNT(DISTINCT c.id) as total_clientes,
                    COUNT(DISTINCT CASE WHEN ec.nombre = 'Activo' THEN c.id END) as clientes_activos,
                    COUNT(DISTINCT s.id) as total_servicios,
                    COALESCE(SUM(CASE WHEN es.nombre = 'Activo' THEN s.precio_mensual ELSE 0 END), 0) as ingreso_mensual
                FROM cat_colonias col
                INNER JOIN cat_ciudades ciu ON col.ciudad_id = ciu.id
                LEFT JOIN clientes c ON c.colonia_id = col.id
                LEFT JOIN cat_estados_cliente ec ON c.estado_id = ec.id
                LEFT JOIN servicios s ON s.cliente_id = c.id
                LEFT JOIN cat_estados_servicio es ON s.estado_id = es.id
                WHERE col.activo = 1
                GROUP BY col.id, col.nombre, ciu.nombre
                ORDER BY total_clientes DESC
                LIMIT 20
            `);

            // Totales generales
            const [totales] = await pool.query(`
                SELECT 
                    COUNT(DISTINCT c.id) as total_clientes,
                    COUNT(DISTINCT s.id) as total_servicios,
                    COALESCE(SUM(CASE WHEN es.nombre = 'Activo' THEN s.precio_mensual ELSE 0 END), 0) as ingreso_mensual_total
                FROM clientes c
                LEFT JOIN servicios s ON s.cliente_id = c.id
                LEFT JOIN cat_estados_servicio es ON s.estado_id = es.id
            `);

            res.json({
                ok: true,
                data: {
                    por_ciudad: porCiudad,
                    por_colonia: porColonia,
                    totales: totales[0]
                }
            });
        } catch (error) {
            console.error('Error en reporte por ubicación:', error);
            res.status(500).json({ ok: false, mensaje: 'Error al generar reporte' });
        }
    },

    // Pagos por periodo
    async pagosPorPeriodo(req, res) {
        try {
            const { fecha_desde, fecha_hasta, tipo_pago_id, agrupacion = 'dia' } = req.query;

            let formatoFecha;
            switch (agrupacion) {
                case 'mes':
                    formatoFecha = '%Y-%m';
                    break;
                case 'semana':
                    formatoFecha = '%Y-%u';
                    break;
                default:
                    formatoFecha = '%Y-%m-%d';
            }

            let query = `
                SELECT 
                    DATE_FORMAT(p.fecha_pago, '${formatoFecha}') as periodo,
                    COUNT(p.id) as cantidad_pagos,
                    SUM(p.monto_total) as monto_total,
                    tp.nombre as tipo_pago
                FROM pagos p
                INNER JOIN cat_tipos_pago tp ON p.tipo_pago_id = tp.id
                INNER JOIN cat_estados_pago ep ON p.estado_id = ep.id
                WHERE ep.nombre != 'Cancelado'
            `;

            const params = [];

            if (fecha_desde) {
                query += ` AND p.fecha_pago >= ?`;
                params.push(fecha_desde);
            }

            if (fecha_hasta) {
                query += ` AND p.fecha_pago <= ?`;
                params.push(fecha_hasta);
            }

            if (tipo_pago_id) {
                query += ` AND p.tipo_pago_id = ?`;
                params.push(tipo_pago_id);
            }

            query += ` GROUP BY periodo, tp.id, tp.nombre ORDER BY periodo DESC`;

            const [pagos] = await pool.query(query, params);

            // Resumen por tipo de pago
            let resumenQuery = `
                SELECT 
                    tp.nombre as tipo_pago,
                    COUNT(p.id) as cantidad,
                    SUM(p.monto_total) as monto_total
                FROM pagos p
                INNER JOIN cat_tipos_pago tp ON p.tipo_pago_id = tp.id
                INNER JOIN cat_estados_pago ep ON p.estado_id = ep.id
                WHERE ep.nombre != 'Cancelado'
            `;

            const resumenParams = [];

            if (fecha_desde) {
                resumenQuery += ` AND p.fecha_pago >= ?`;
                resumenParams.push(fecha_desde);
            }

            if (fecha_hasta) {
                resumenQuery += ` AND p.fecha_pago <= ?`;
                resumenParams.push(fecha_hasta);
            }

            resumenQuery += ` GROUP BY tp.id, tp.nombre`;

            const [resumen] = await pool.query(resumenQuery, resumenParams);

            // Total general
            let totalQuery = `
                SELECT 
                    COUNT(p.id) as total_pagos,
                    COALESCE(SUM(p.monto_total), 0) as monto_total
                FROM pagos p
                INNER JOIN cat_estados_pago ep ON p.estado_id = ep.id
                WHERE ep.nombre != 'Cancelado'
            `;

            const totalParams = [];

            if (fecha_desde) {
                totalQuery += ` AND p.fecha_pago >= ?`;
                totalParams.push(fecha_desde);
            }

            if (fecha_hasta) {
                totalQuery += ` AND p.fecha_pago <= ?`;
                totalParams.push(fecha_hasta);
            }

            const [total] = await pool.query(totalQuery, totalParams);

            res.json({
                ok: true,
                data: {
                    detalle: pagos,
                    por_tipo: resumen,
                    total: total[0]
                }
            });
        } catch (error) {
            console.error('Error en reporte pagos por periodo:', error);
            res.status(500).json({ ok: false, mensaje: 'Error al generar reporte' });
        }
    },

    // Ingresos proyectados vs reales
    async ingresosComparativo(req, res) {
        try {
            const { mes, anio } = req.query;
            const mesActual = mes || new Date().getMonth() + 1;
            const anioActual = anio || new Date().getFullYear();

            // Ingreso proyectado (servicios activos)
            const [proyectado] = await pool.query(`
                SELECT 
                    COALESCE(SUM(s.precio_mensual), 0) as ingreso_proyectado,
                    COUNT(s.id) as servicios_activos
                FROM servicios s
                INNER JOIN cat_estados_servicio es ON s.estado_id = es.id
                WHERE es.nombre = 'Activo'
            `);

            // Cargos emitidos del mes
            const [cargosEmitidos] = await pool.query(`
                SELECT 
                    COALESCE(SUM(c.monto), 0) as total_cargos,
                    COALESCE(SUM(c.monto_pagado), 0) as total_cobrado,
                    COALESCE(SUM(c.saldo), 0) as total_pendiente,
                    COUNT(c.id) as cantidad_cargos
                FROM cargos c
                WHERE c.periodo_mes = ? AND c.periodo_anio = ?
            `, [mesActual, anioActual]);

            // Pagos recibidos en el mes
            const [pagosRecibidos] = await pool.query(`
                SELECT 
                    COALESCE(SUM(p.monto_total), 0) as total_pagos,
                    COUNT(p.id) as cantidad_pagos
                FROM pagos p
                INNER JOIN cat_estados_pago ep ON p.estado_id = ep.id
                WHERE ep.nombre != 'Cancelado'
                AND MONTH(p.fecha_pago) = ?
                AND YEAR(p.fecha_pago) = ?
            `, [mesActual, anioActual]);

            // Comparativo últimos 6 meses
            const [historico] = await pool.query(`
                SELECT 
                    c.periodo_mes as mes,
                    c.periodo_anio as anio,
                    COALESCE(SUM(c.monto), 0) as facturado,
                    COALESCE(SUM(c.monto_pagado), 0) as cobrado
                FROM cargos c
                WHERE (c.periodo_anio = ? AND c.periodo_mes <= ?)
                   OR (c.periodo_anio = ? - 1 AND c.periodo_mes > ?)
                GROUP BY c.periodo_anio, c.periodo_mes
                ORDER BY c.periodo_anio DESC, c.periodo_mes DESC
                LIMIT 6
            `, [anioActual, mesActual, anioActual, mesActual]);

            res.json({
                ok: true,
                data: {
                    mes: mesActual,
                    anio: anioActual,
                    proyectado: proyectado[0],
                    cargos_mes: cargosEmitidos[0],
                    pagos_mes: pagosRecibidos[0],
                    historico: historico.reverse()
                }
            });
        } catch (error) {
            console.error('Error en reporte comparativo:', error);
            res.status(500).json({ ok: false, mensaje: 'Error al generar reporte' });
        }
    },

    // Dashboard general (solo admin)
    async dashboard(req, res) {
        try {
            // Clientes
            const [clientes] = await pool.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN ec.nombre = 'Activo' THEN 1 ELSE 0 END) as activos
                FROM clientes c
                INNER JOIN cat_estados_cliente ec ON c.estado_id = ec.id
            `);

            // Servicios
            const [servicios] = await pool.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN es.nombre = 'Activo' THEN 1 ELSE 0 END) as activos,
                    COALESCE(SUM(CASE WHEN es.nombre = 'Activo' THEN s.precio_mensual ELSE 0 END), 0) as ingreso_mensual
                FROM servicios s
                INNER JOIN cat_estados_servicio es ON s.estado_id = es.id
            `);

            // Adeudo total
            const [adeudo] = await pool.query(`
                SELECT COALESCE(SUM(saldo), 0) as total_adeudo
                FROM cargos c
                INNER JOIN cat_estados_cargo ec ON c.estado_id = ec.id
                WHERE ec.nombre IN ('Pendiente', 'Parcial')
            `);

            // Pagos del día
            const [pagosHoy] = await pool.query(`
                SELECT 
                    COUNT(*) as cantidad,
                    COALESCE(SUM(monto_total), 0) as monto
                FROM pagos p
                INNER JOIN cat_estados_pago ep ON p.estado_id = ep.id
                WHERE DATE(p.fecha_pago) = CURDATE()
                AND ep.nombre != 'Cancelado'
            `);

            // Pagos del mes
            const [pagosMes] = await pool.query(`
                SELECT 
                    COUNT(*) as cantidad,
                    COALESCE(SUM(monto_total), 0) as monto
                FROM pagos p
                INNER JOIN cat_estados_pago ep ON p.estado_id = ep.id
                WHERE MONTH(p.fecha_pago) = MONTH(CURDATE())
                AND YEAR(p.fecha_pago) = YEAR(CURDATE())
                AND ep.nombre != 'Cancelado'
            `);

            // Instalaciones pendientes
            const [instalaciones] = await pool.query(`
                SELECT COUNT(*) as pendientes
                FROM instalaciones i
                INNER JOIN cat_estados_instalacion ei ON i.estado_id = ei.id
                WHERE ei.nombre IN ('Programada', 'Reprogramada')
            `);

            // Últimos pagos
            const [ultimosPagos] = await pool.query(`
                SELECT 
                    p.numero_recibo,
                    p.monto_total,
                    p.fecha_pago,
                    CONCAT(c.nombre, ' ', c.apellido_paterno) as cliente
                FROM pagos p
                INNER JOIN clientes c ON p.cliente_id = c.id
                INNER JOIN cat_estados_pago ep ON p.estado_id = ep.id
                WHERE ep.nombre != 'Cancelado'
                ORDER BY p.fecha_pago DESC
                LIMIT 5
            `);

            res.json({
                ok: true,
                data: {
                    clientes: clientes[0],
                    servicios: servicios[0],
                    adeudo_total: adeudo[0].total_adeudo,
                    pagos_hoy: pagosHoy[0],
                    pagos_mes: pagosMes[0],
                    instalaciones_pendientes: instalaciones[0].pendientes,
                    ultimos_pagos: ultimosPagos
                }
            });
        } catch (error) {
            console.error('Error en dashboard:', error);
            res.status(500).json({ ok: false, mensaje: 'Error al generar dashboard' });
        }
    }
};

module.exports = reportesController;

const db = require('../config/database');
const { logActividad, getClientIp, paginate, response } = require('../utils/helpers');

const getAll = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, servicio_id, fecha_desde, fecha_hasta, metodo_pago_id } = req.query;
        const { limit: lim, offset } = paginate(page, limit);

        let where = `WHERE p.deleted_at IS NULL AND p.is_active = 1 AND p.estatus = 'APLICADO'`;
        const params = [];

        if (servicio_id) {
            where += ` AND p.servicio_id = ?`;
            params.push(servicio_id);
        }
        if (fecha_desde) {
            where += ` AND DATE(p.fecha_pago) >= ?`;
            params.push(fecha_desde);
        }
        if (fecha_hasta) {
            where += ` AND DATE(p.fecha_pago) <= ?`;
            params.push(fecha_hasta);
        }
        if (metodo_pago_id) {
            where += ` AND p.metodo_pago_id = ?`;
            params.push(metodo_pago_id);
        }

        const [total] = await db.query(`SELECT COUNT(*) as total FROM pagos p ${where}`, params);

        const [pagos] = await db.query(
            `SELECT p.*, mp.nombre as metodo_pago, b.nombre as banco,
                    s.codigo as servicio_codigo, c.nombre as cliente_nombre, c.apellido_paterno as cliente_apellido,
                    u.nombre as registrado_por
             FROM pagos p
             LEFT JOIN cat_metodos_pago mp ON p.metodo_pago_id = mp.id
             LEFT JOIN cat_bancos b ON p.banco_id = b.id
             LEFT JOIN servicios s ON p.servicio_id = s.id
             LEFT JOIN clientes c ON s.cliente_id = c.id
             LEFT JOIN usuarios u ON p.created_by = u.id
             ${where}
             ORDER BY p.fecha_pago DESC
             LIMIT ? OFFSET ?`,
            [...params, lim, offset]
        );

        response.paginated(res, pagos, total[0].total, page, limit);
    } catch (error) {
        next(error);
    }
};

const getByServicio = async (req, res, next) => {
    try {
        const { servicioId } = req.params;

        const [pagos] = await db.query(
            `SELECT p.*, mp.nombre as metodo_pago, b.nombre as banco, u.nombre as registrado_por
             FROM pagos p
             LEFT JOIN cat_metodos_pago mp ON p.metodo_pago_id = mp.id
             LEFT JOIN cat_bancos b ON p.banco_id = b.id
             LEFT JOIN usuarios u ON p.created_by = u.id
             WHERE p.servicio_id = ? AND p.is_active = 1 AND p.deleted_at IS NULL
             ORDER BY p.fecha_pago DESC`,
            [servicioId]
        );

        response.success(res, pagos);
    } catch (error) {
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const [pagos] = await db.query(
            `SELECT p.*, mp.nombre as metodo_pago, b.nombre as banco, u.nombre as registrado_por,
                    s.codigo as servicio_codigo, c.nombre as cliente_nombre, c.apellido_paterno as cliente_apellido
             FROM pagos p
             LEFT JOIN cat_metodos_pago mp ON p.metodo_pago_id = mp.id
             LEFT JOIN cat_bancos b ON p.banco_id = b.id
             LEFT JOIN usuarios u ON p.created_by = u.id
             LEFT JOIN servicios s ON p.servicio_id = s.id
             LEFT JOIN clientes c ON s.cliente_id = c.id
             WHERE p.id = ? AND p.deleted_at IS NULL`,
            [req.params.id]
        );

        if (pagos.length === 0) {
            return response.error(res, 'Pago no encontrado', 404);
        }

        const [detalles] = await db.query(
            `SELECT pd.*, ca.descripcion as cargo_descripcion, ca.periodo_mes, ca.periodo_anio, cc.nombre as concepto
             FROM pago_detalles pd
             LEFT JOIN cargos ca ON pd.cargo_id = ca.id
             LEFT JOIN cat_conceptos_cobro cc ON ca.concepto_id = cc.id
             WHERE pd.pago_id = ? AND pd.is_active = 1`,
            [req.params.id]
        );

        response.success(res, { ...pagos[0], detalles });
    } catch (error) {
        next(error);
    }
};

const create = async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const {
            servicio_id, monto_total, metodo_pago_id, banco_id,
            referencia, quien_envia_pago, telefono_quien_envia, observaciones,
            cargos_a_pagar // Array de { cargo_id, monto }
        } = req.body;

        if (!servicio_id || !monto_total) {
            return response.error(res, 'servicio_id y monto_total son requeridos', 400);
        }

        // Generar número de recibo
        const [ultimoRecibo] = await conn.query(
            `SELECT MAX(CAST(SUBSTRING(numero_recibo, 4) AS UNSIGNED)) as ultimo FROM pagos WHERE numero_recibo LIKE 'REC%'`
        );
        const siguienteRecibo = (ultimoRecibo[0].ultimo || 0) + 1;
        const numeroRecibo = `REC${String(siguienteRecibo).padStart(8, '0')}`;

        // Crear pago
        const [pagoResult] = await conn.query(
            `INSERT INTO pagos (servicio_id, numero_recibo, monto_total, fecha_pago, metodo_pago_id, banco_id, referencia, quien_envia_pago, telefono_quien_envia, observaciones, created_by)
             VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
            [servicio_id, numeroRecibo, monto_total, metodo_pago_id, banco_id, referencia, quien_envia_pago, telefono_quien_envia, observaciones, req.userId]
        );

        const pagoId = pagoResult.insertId;
        let montoRestante = parseFloat(monto_total);
        const cargosAplicados = [];

        if (cargos_a_pagar && cargos_a_pagar.length > 0) {
            // Aplicar a cargos específicos
            for (const item of cargos_a_pagar) {
                if (montoRestante <= 0) break;

                const [cargo] = await conn.query(
                    `SELECT id, saldo_pendiente FROM cargos WHERE id = ? AND servicio_id = ? AND estatus IN ('PENDIENTE', 'PARCIAL')`,
                    [item.cargo_id, servicio_id]
                );

                if (cargo.length === 0) continue;

                const montoAplicar = Math.min(parseFloat(item.monto || cargo[0].saldo_pendiente), montoRestante, cargo[0].saldo_pendiente);

                await conn.query(
                    `INSERT INTO pago_detalles (pago_id, cargo_id, monto_aplicado, created_by) VALUES (?, ?, ?, ?)`,
                    [pagoId, item.cargo_id, montoAplicar, req.userId]
                );

                const nuevoSaldo = cargo[0].saldo_pendiente - montoAplicar;
                const nuevoEstatus = nuevoSaldo <= 0 ? 'PAGADO' : 'PARCIAL';

                await conn.query(
                    `UPDATE cargos SET saldo_pendiente = ?, estatus = ?, updated_by = ? WHERE id = ?`,
                    [Math.max(0, nuevoSaldo), nuevoEstatus, req.userId, item.cargo_id]
                );

                montoRestante -= montoAplicar;
                cargosAplicados.push({ cargo_id: item.cargo_id, monto: montoAplicar });
            }
        } else {
            // Aplicar automáticamente a cargos pendientes (del más antiguo al más reciente)
            const [cargosPendientes] = await conn.query(
                `SELECT id, saldo_pendiente FROM cargos 
                 WHERE servicio_id = ? AND estatus IN ('PENDIENTE', 'PARCIAL') AND is_active = 1
                 ORDER BY fecha_vencimiento ASC`,
                [servicio_id]
            );

            for (const cargo of cargosPendientes) {
                if (montoRestante <= 0) break;

                const montoAplicar = Math.min(cargo.saldo_pendiente, montoRestante);

                await conn.query(
                    `INSERT INTO pago_detalles (pago_id, cargo_id, monto_aplicado, created_by) VALUES (?, ?, ?, ?)`,
                    [pagoId, cargo.id, montoAplicar, req.userId]
                );

                const nuevoSaldo = cargo.saldo_pendiente - montoAplicar;
                const nuevoEstatus = nuevoSaldo <= 0 ? 'PAGADO' : 'PARCIAL';

                await conn.query(
                    `UPDATE cargos SET saldo_pendiente = ?, estatus = ?, updated_by = ? WHERE id = ?`,
                    [Math.max(0, nuevoSaldo), nuevoEstatus, req.userId, cargo.id]
                );

                montoRestante -= montoAplicar;
                cargosAplicados.push({ cargo_id: cargo.id, monto: montoAplicar });
            }
        }

        // Si hay saldo a favor, registrarlo
        if (montoRestante > 0) {
            await conn.query(
                `INSERT INTO saldos_cliente (servicio_id, saldo_favor, created_by)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE saldo_favor = saldo_favor + ?, ultima_actualizacion = NOW(), updated_by = ?`,
                [servicio_id, montoRestante, req.userId, montoRestante, req.userId]
            );

            await conn.query(
                `INSERT INTO movimientos_saldo (servicio_id, tipo, monto, descripcion, referencia_tipo, referencia_id, created_by)
                 VALUES (?, 'ABONO', ?, 'Saldo a favor por pago', 'pagos', ?, ?)`,
                [servicio_id, montoRestante, pagoId, req.userId]
            );
        }

        await conn.commit();

        await logActividad(req.userId, 'CREAR', 'PAGOS', `Pago registrado: ${numeroRecibo} - $${monto_total}`, getClientIp(req));

        response.success(res, {
            id: pagoId,
            numero_recibo: numeroRecibo,
            cargos_aplicados: cargosAplicados,
            saldo_favor: montoRestante > 0 ? montoRestante : 0
        }, 'Pago registrado', 201);

    } catch (error) {
        await conn.rollback();
        next(error);
    } finally {
        conn.release();
    }
};

const cancelar = async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { id } = req.params;
        const { motivo } = req.body;

        const [pago] = await conn.query(
            `SELECT * FROM pagos WHERE id = ? AND estatus = 'APLICADO'`,
            [id]
        );

        if (pago.length === 0) {
            return response.error(res, 'Pago no encontrado o ya cancelado', 404);
        }

        // Revertir aplicaciones a cargos
        const [detalles] = await conn.query(
            `SELECT * FROM pago_detalles WHERE pago_id = ? AND is_active = 1`,
            [id]
        );

        for (const detalle of detalles) {
            await conn.query(
                `UPDATE cargos SET saldo_pendiente = saldo_pendiente + ?, 
                 estatus = CASE WHEN saldo_pendiente + ? >= monto THEN 'PENDIENTE' ELSE 'PARCIAL' END,
                 updated_by = ? WHERE id = ?`,
                [detalle.monto_aplicado, detalle.monto_aplicado, req.userId, detalle.cargo_id]
            );
        }

        // Cancelar pago
        await conn.query(
            `UPDATE pagos SET estatus = 'CANCELADO', observaciones = CONCAT(IFNULL(observaciones, ''), ' | CANCELADO: ', ?), updated_by = ? WHERE id = ?`,
            [motivo || 'Sin motivo', req.userId, id]
        );

        await conn.commit();

        await logActividad(req.userId, 'CANCELAR', 'PAGOS', `Pago cancelado: ${pago[0].numero_recibo}`, getClientIp(req));

        response.success(res, null, 'Pago cancelado');
    } catch (error) {
        await conn.rollback();
        next(error);
    } finally {
        conn.release();
    }
};

const getRecibo = async (req, res, next) => {
    try {
        const [pagos] = await db.query(
            `SELECT p.*, mp.nombre as metodo_pago, b.nombre as banco,
                    s.codigo as servicio_codigo, 
                    c.nombre as cliente_nombre, c.apellido_paterno as cliente_apellido, c.apellido_materno as cliente_apellido_materno,
                    c.calle, c.numero_exterior, c.telefono1,
                    ci.nombre as ciudad, col.nombre as colonia,
                    t.nombre as tarifa, t.monto as tarifa_monto
             FROM pagos p
             LEFT JOIN cat_metodos_pago mp ON p.metodo_pago_id = mp.id
             LEFT JOIN cat_bancos b ON p.banco_id = b.id
             LEFT JOIN servicios s ON p.servicio_id = s.id
             LEFT JOIN clientes c ON s.cliente_id = c.id
             LEFT JOIN cat_ciudades ci ON c.ciudad_id = ci.id
             LEFT JOIN cat_colonias col ON c.colonia_id = col.id
             LEFT JOIN cat_tarifas t ON s.tarifa_id = t.id
             WHERE p.id = ?`,
            [req.params.id]
        );

        if (pagos.length === 0) {
            return response.error(res, 'Pago no encontrado', 404);
        }

        const [detalles] = await db.query(
            `SELECT pd.*, ca.descripcion, ca.periodo_mes, ca.periodo_anio, cc.nombre as concepto
             FROM pago_detalles pd
             LEFT JOIN cargos ca ON pd.cargo_id = ca.id
             LEFT JOIN cat_conceptos_cobro cc ON ca.concepto_id = cc.id
             WHERE pd.pago_id = ? AND pd.is_active = 1`,
            [req.params.id]
        );

        const [config] = await db.query(
            `SELECT clave, valor FROM configuracion WHERE clave IN ('EMPRESA_NOMBRE', 'EMPRESA_DIRECCION', 'EMPRESA_TELEFONO', 'EMPRESA_RFC')`
        );

        const empresa = {};
        config.forEach(c => empresa[c.clave] = c.valor);

        response.success(res, { pago: pagos[0], detalles, empresa });
    } catch (error) {
        next(error);
    }
};

module.exports = { getAll, getByServicio, getById, create, cancelar, getRecibo };

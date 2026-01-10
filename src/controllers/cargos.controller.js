const db = require('../config/database');
const { logActividad, getClientIp, paginate, response } = require('../utils/helpers');

const getAll = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, servicio_id, estatus, fecha_desde, fecha_hasta } = req.query;
        const { limit: lim, offset } = paginate(page, limit);

        let where = 'WHERE ca.deleted_at IS NULL AND ca.is_active = 1';
        const params = [];

        if (servicio_id) {
            where += ` AND ca.servicio_id = ?`;
            params.push(servicio_id);
        }
        if (estatus) {
            where += ` AND ca.estatus = ?`;
            params.push(estatus);
        }
        if (fecha_desde) {
            where += ` AND ca.fecha_vencimiento >= ?`;
            params.push(fecha_desde);
        }
        if (fecha_hasta) {
            where += ` AND ca.fecha_vencimiento <= ?`;
            params.push(fecha_hasta);
        }

        const [total] = await db.query(`SELECT COUNT(*) as total FROM cargos ca ${where}`, params);

        const [cargos] = await db.query(
            `SELECT ca.*, cc.nombre as concepto, ct.nombre as cargo_tipo,
                    s.codigo as servicio_codigo, c.nombre as cliente_nombre, c.apellido_paterno as cliente_apellido
             FROM cargos ca
             LEFT JOIN cat_conceptos_cobro cc ON ca.concepto_id = cc.id
             LEFT JOIN cat_cargos_tipo ct ON ca.cargo_tipo_id = ct.id
             LEFT JOIN servicios s ON ca.servicio_id = s.id
             LEFT JOIN clientes c ON s.cliente_id = c.id
             ${where}
             ORDER BY ca.fecha_vencimiento DESC
             LIMIT ? OFFSET ?`,
            [...params, lim, offset]
        );

        response.paginated(res, cargos, total[0].total, page, limit);
    } catch (error) {
        next(error);
    }
};

const getPendientes = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, vencidos = false } = req.query;
        const { limit: lim, offset } = paginate(page, limit);

        let where = `WHERE ca.deleted_at IS NULL AND ca.is_active = 1 AND ca.estatus IN ('PENDIENTE', 'PARCIAL')`;
        if (vencidos === 'true') {
            where += ` AND ca.fecha_vencimiento < CURDATE()`;
        }

        const [total] = await db.query(`SELECT COUNT(*) as total FROM cargos ca ${where}`);

        const [cargos] = await db.query(
            `SELECT ca.*, cc.nombre as concepto,
                    s.codigo as servicio_codigo, c.id as cliente_id, c.codigo as cliente_codigo,
                    c.nombre as cliente_nombre, c.apellido_paterno as cliente_apellido, c.telefono1,
                    DATEDIFF(CURDATE(), ca.fecha_vencimiento) as dias_vencido
             FROM cargos ca
             LEFT JOIN cat_conceptos_cobro cc ON ca.concepto_id = cc.id
             LEFT JOIN servicios s ON ca.servicio_id = s.id
             LEFT JOIN clientes c ON s.cliente_id = c.id
             ${where}
             ORDER BY ca.fecha_vencimiento ASC
             LIMIT ? OFFSET ?`,
            [lim, offset]
        );

        response.paginated(res, cargos, total[0].total, page, limit);
    } catch (error) {
        next(error);
    }
};

const getByServicio = async (req, res, next) => {
    try {
        const { servicioId } = req.params;
        const { estatus } = req.query;

        let where = 'WHERE ca.servicio_id = ? AND ca.deleted_at IS NULL';
        const params = [servicioId];

        if (estatus) {
            where += ` AND ca.estatus = ?`;
            params.push(estatus);
        }

        const [cargos] = await db.query(
            `SELECT ca.*, cc.nombre as concepto, ct.nombre as cargo_tipo
             FROM cargos ca
             LEFT JOIN cat_conceptos_cobro cc ON ca.concepto_id = cc.id
             LEFT JOIN cat_cargos_tipo ct ON ca.cargo_tipo_id = ct.id
             ${where}
             ORDER BY ca.fecha_vencimiento DESC`,
            params
        );

        const [resumen] = await db.query(
            `SELECT 
                SUM(CASE WHEN estatus IN ('PENDIENTE', 'PARCIAL') THEN saldo_pendiente ELSE 0 END) as total_pendiente,
                SUM(CASE WHEN estatus = 'PAGADO' THEN monto ELSE 0 END) as total_pagado,
                COUNT(CASE WHEN estatus IN ('PENDIENTE', 'PARCIAL') AND fecha_vencimiento < CURDATE() THEN 1 END) as cargos_vencidos
             FROM cargos WHERE servicio_id = ? AND is_active = 1 AND deleted_at IS NULL`,
            [servicioId]
        );

        response.success(res, { cargos, resumen: resumen[0] });
    } catch (error) {
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const [cargos] = await db.query(
            `SELECT ca.*, cc.nombre as concepto, ct.nombre as cargo_tipo
             FROM cargos ca
             LEFT JOIN cat_conceptos_cobro cc ON ca.concepto_id = cc.id
             LEFT JOIN cat_cargos_tipo ct ON ca.cargo_tipo_id = ct.id
             WHERE ca.id = ? AND ca.deleted_at IS NULL`,
            [req.params.id]
        );

        if (cargos.length === 0) {
            return response.error(res, 'Cargo no encontrado', 404);
        }

        const [pagos] = await db.query(
            `SELECT pd.*, p.numero_recibo, p.fecha_pago, p.metodo_pago_id, mp.nombre as metodo_pago
             FROM pago_detalles pd
             LEFT JOIN pagos p ON pd.pago_id = p.id
             LEFT JOIN cat_metodos_pago mp ON p.metodo_pago_id = mp.id
             WHERE pd.cargo_id = ? AND pd.is_active = 1`,
            [req.params.id]
        );

        response.success(res, { ...cargos[0], pagos });
    } catch (error) {
        next(error);
    }
};

const create = async (req, res, next) => {
    try {
        const { servicio_id, concepto_id, cargo_tipo_id, descripcion, monto, fecha_vencimiento, periodo_mes, periodo_anio } = req.body;

        if (!servicio_id || !concepto_id || !monto || !fecha_vencimiento) {
            return response.error(res, 'Campos requeridos: servicio_id, concepto_id, monto, fecha_vencimiento', 400);
        }

        const [result] = await db.query(
            `INSERT INTO cargos (servicio_id, concepto_id, cargo_tipo_id, descripcion, monto, fecha_vencimiento, periodo_mes, periodo_anio, saldo_pendiente, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [servicio_id, concepto_id, cargo_tipo_id, descripcion, monto, fecha_vencimiento, periodo_mes, periodo_anio, monto, req.userId]
        );

        await logActividad(req.userId, 'CREAR', 'CARGOS', `Cargo creado: ${result.insertId}`, getClientIp(req));

        response.success(res, { id: result.insertId }, 'Cargo creado', 201);
    } catch (error) {
        next(error);
    }
};

const generarMensualidades = async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { mes, anio } = req.body;

        if (!mes || !anio) {
            return response.error(res, 'mes y anio son requeridos', 400);
        }

        const [conceptoMensualidad] = await conn.query(
            `SELECT id FROM cat_conceptos_cobro WHERE clave = 'MENSUALIDAD' LIMIT 1`
        );

        const [serviciosActivos] = await conn.query(
            `SELECT s.id, s.tarifa_id, s.dia_corte, t.monto
             FROM servicios s
             JOIN cat_tarifas t ON s.tarifa_id = t.id
             JOIN cat_estatus_servicio es ON s.estatus_id = es.id
             WHERE es.clave = 'ACTIVO' AND s.is_active = 1 AND s.deleted_at IS NULL`
        );

        let generados = 0;
        let omitidos = 0;

        for (const servicio of serviciosActivos) {
            const [existe] = await conn.query(
                `SELECT 1 FROM cargos WHERE servicio_id = ? AND periodo_mes = ? AND periodo_anio = ? AND concepto_id = ? AND is_active = 1`,
                [servicio.id, mes, anio, conceptoMensualidad[0].id]
            );

            if (existe.length > 0) {
                omitidos++;
                continue;
            }

            const fechaVencimiento = `${anio}-${String(mes).padStart(2, '0')}-${String(servicio.dia_corte || 10).padStart(2, '0')}`;

            await conn.query(
                `INSERT INTO cargos (servicio_id, concepto_id, descripcion, monto, fecha_vencimiento, periodo_mes, periodo_anio, saldo_pendiente, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [servicio.id, conceptoMensualidad[0].id, `Mensualidad ${mes}/${anio}`, servicio.monto, fechaVencimiento, mes, anio, servicio.monto, req.userId]
            );

            generados++;
        }

        await conn.commit();

        await logActividad(req.userId, 'GENERAR_MENSUALIDADES', 'CARGOS', `Mensualidades ${mes}/${anio}: ${generados} generados, ${omitidos} omitidos`, getClientIp(req));

        response.success(res, { generados, omitidos, total_servicios: serviciosActivos.length }, 'Mensualidades generadas');
    } catch (error) {
        await conn.rollback();
        next(error);
    } finally {
        conn.release();
    }
};

const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { descripcion, monto, fecha_vencimiento } = req.body;

        const [current] = await db.query(`SELECT * FROM cargos WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (current.length === 0) {
            return response.error(res, 'Cargo no encontrado', 404);
        }

        if (current[0].estatus === 'PAGADO') {
            return response.error(res, 'No se puede editar un cargo pagado', 400);
        }

        const updates = [];
        const values = [];

        if (descripcion !== undefined) {
            updates.push('descripcion = ?');
            values.push(descripcion);
        }
        if (monto !== undefined) {
            updates.push('monto = ?', 'saldo_pendiente = ?');
            values.push(monto, monto);
        }
        if (fecha_vencimiento !== undefined) {
            updates.push('fecha_vencimiento = ?');
            values.push(fecha_vencimiento);
        }

        if (updates.length > 0) {
            updates.push('updated_by = ?');
            values.push(req.userId, id);
            await db.query(`UPDATE cargos SET ${updates.join(', ')} WHERE id = ?`, values);
        }

        response.success(res, null, 'Cargo actualizado');
    } catch (error) {
        next(error);
    }
};

const deleteCargo = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [current] = await db.query(`SELECT estatus FROM cargos WHERE id = ?`, [id]);
        if (current.length === 0) {
            return response.error(res, 'Cargo no encontrado', 404);
        }

        if (current[0].estatus === 'PAGADO') {
            return response.error(res, 'No se puede eliminar un cargo pagado', 400);
        }

        await db.query(
            `UPDATE cargos SET deleted_at = NOW(), deleted_by = ?, is_active = 0 WHERE id = ?`,
            [req.userId, id]
        );

        await logActividad(req.userId, 'ELIMINAR', 'CARGOS', `Cargo eliminado: ${id}`, getClientIp(req));

        response.success(res, null, 'Cargo eliminado');
    } catch (error) {
        next(error);
    }
};

const cancelar = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { motivo } = req.body;

        const [current] = await db.query(`SELECT estatus FROM cargos WHERE id = ?`, [id]);
        if (current.length === 0) {
            return response.error(res, 'Cargo no encontrado', 404);
        }

        if (current[0].estatus === 'PAGADO') {
            return response.error(res, 'No se puede cancelar un cargo pagado', 400);
        }

        await db.query(
            `UPDATE cargos SET estatus = 'CANCELADO', updated_by = ? WHERE id = ?`,
            [req.userId, id]
        );

        await logActividad(req.userId, 'CANCELAR', 'CARGOS', `Cargo cancelado: ${id}. Motivo: ${motivo || 'N/A'}`, getClientIp(req));

        response.success(res, null, 'Cargo cancelado');
    } catch (error) {
        next(error);
    }
};

module.exports = { getAll, getPendientes, getByServicio, getById, create, generarMensualidades, update, delete: deleteCargo, cancelar };

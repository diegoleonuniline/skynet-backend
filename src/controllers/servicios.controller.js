const db = require('../config/database');
const { registrarCambio, logActividad, getClientIp, generarCodigo, calcularProrrateo, calcularFechaVencimiento, paginate, response } = require('../utils/helpers');

const getAll = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, cliente_id, estatus_id, tarifa_id } = req.query;
        const { limit: lim, offset } = paginate(page, limit);

        let where = 'WHERE s.deleted_at IS NULL';
        const params = [];

        if (cliente_id) {
            where += ` AND s.cliente_id = ?`;
            params.push(cliente_id);
        }
        if (estatus_id) {
            where += ` AND s.estatus_id = ?`;
            params.push(estatus_id);
        }
        if (tarifa_id) {
            where += ` AND s.tarifa_id = ?`;
            params.push(tarifa_id);
        }

        const [total] = await db.query(`SELECT COUNT(*) as total FROM servicios s ${where}`, params);

        const [servicios] = await db.query(
            `SELECT s.*, c.nombre as cliente_nombre, c.apellido_paterno as cliente_apellido, c.codigo as cliente_codigo,
                    t.nombre as tarifa, t.monto as tarifa_monto,
                    es.nombre as estatus, es.color as estatus_color,
                    u.nombre as tecnico_nombre
             FROM servicios s
             LEFT JOIN clientes c ON s.cliente_id = c.id
             LEFT JOIN cat_tarifas t ON s.tarifa_id = t.id
             LEFT JOIN cat_estatus_servicio es ON s.estatus_id = es.id
             LEFT JOIN usuarios u ON s.tecnico_instalador_id = u.id
             ${where}
             ORDER BY s.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, lim, offset]
        );

        response.paginated(res, servicios, total[0].total, page, limit);
    } catch (error) {
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const [servicios] = await db.query(
            `SELECT s.*, c.nombre as cliente_nombre, c.apellido_paterno as cliente_apellido, c.codigo as cliente_codigo,
                    t.nombre as tarifa, t.monto as tarifa_monto, t.velocidad_mbps,
                    es.nombre as estatus, es.color as estatus_color,
                    u.nombre as tecnico_nombre,
                    sc.saldo_favor, sc.saldo_contra
             FROM servicios s
             LEFT JOIN clientes c ON s.cliente_id = c.id
             LEFT JOIN cat_tarifas t ON s.tarifa_id = t.id
             LEFT JOIN cat_estatus_servicio es ON s.estatus_id = es.id
             LEFT JOIN usuarios u ON s.tecnico_instalador_id = u.id
             LEFT JOIN saldos_cliente sc ON s.id = sc.servicio_id
             WHERE s.id = ? AND s.deleted_at IS NULL`,
            [req.params.id]
        );

        if (servicios.length === 0) {
            return response.error(res, 'Servicio no encontrado', 404);
        }

        const [equipos] = await db.query(
            `SELECT se.*, te.nombre as tipo, m.nombre as marca, mo.nombre as modelo
             FROM servicio_equipos se
             LEFT JOIN cat_tipo_equipo te ON se.tipo_equipo_id = te.id
             LEFT JOIN cat_marcas_equipo m ON se.marca_id = m.id
             LEFT JOIN cat_modelos_equipo mo ON se.modelo_id = mo.id
             WHERE se.servicio_id = ? AND se.is_active = 1 AND se.deleted_at IS NULL`,
            [req.params.id]
        );

        const [cargosPendientes] = await db.query(
            `SELECT SUM(saldo_pendiente) as total_adeudo
             FROM cargos WHERE servicio_id = ? AND estatus IN ('PENDIENTE', 'PARCIAL') AND is_active = 1`,
            [req.params.id]
        );

        response.success(res, {
            ...servicios[0],
            equipos,
            total_adeudo: cargosPendientes[0].total_adeudo || 0
        });
    } catch (error) {
        next(error);
    }
};

const create = async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const {
            cliente_id, tarifa_id, tecnico_instalador_id,
            fecha_instalacion, costo_instalacion,
            dia_corte = 10, pago_adelantado = 0,
            equipos
        } = req.body;

        if (!cliente_id || !tarifa_id) {
            return response.error(res, 'cliente_id y tarifa_id son requeridos', 400);
        }

        const [tarifa] = await conn.query(`SELECT monto FROM cat_tarifas WHERE id = ?`, [tarifa_id]);
        if (tarifa.length === 0) {
            return response.error(res, 'Tarifa no encontrada', 404);
        }

        const codigo = await generarCodigo('servicios', 'SRV');

        const fechaInstalacion = fecha_instalacion || new Date().toISOString().split('T')[0];
        const { prorrateo, diasProrrateo } = calcularProrrateo(tarifa[0].monto, fechaInstalacion, dia_corte);
        const fechaPrimerVencimiento = calcularFechaVencimiento(fechaInstalacion, dia_corte);

        const [estatusPendiente] = await conn.query(
            `SELECT id FROM cat_estatus_servicio WHERE clave = 'PENDIENTE' LIMIT 1`
        );

        const [result] = await conn.query(
            `INSERT INTO servicios (cliente_id, codigo, tarifa_id, estatus_id, tecnico_instalador_id,
             fecha_instalacion, costo_instalacion, dia_corte, fecha_primer_vencimiento, costo_primer_pago,
             pago_adelantado, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cliente_id, codigo, tarifa_id, estatusPendiente[0]?.id || 4, tecnico_instalador_id,
             fechaInstalacion, costo_instalacion || 0, dia_corte, fechaPrimerVencimiento,
             prorrateo > 0 ? prorrateo : tarifa[0].monto, pago_adelantado, req.userId]
        );

        const servicioId = result.insertId;

        // Registrar historial de tarifa
        await conn.query(
            `INSERT INTO servicio_tarifas_historial (servicio_id, tarifa_id, fecha_inicio, monto, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [servicioId, tarifa_id, fechaInstalacion, tarifa[0].monto, req.userId]
        );

        // Crear saldo inicial
        await conn.query(
            `INSERT INTO saldos_cliente (servicio_id, saldo_favor, saldo_contra, created_by)
             VALUES (?, 0, 0, ?)`,
            [servicioId, req.userId]
        );

        // Generar cargos iniciales
        const [conceptoInstalacion] = await conn.query(
            `SELECT id FROM cat_conceptos_cobro WHERE clave = 'INSTALACION' LIMIT 1`
        );
        const [conceptoProrrateo] = await conn.query(
            `SELECT id FROM cat_conceptos_cobro WHERE clave = 'PRORRATEO' LIMIT 1`
        );
        const [conceptoMensualidad] = await conn.query(
            `SELECT id FROM cat_conceptos_cobro WHERE clave = 'MENSUALIDAD' LIMIT 1`
        );

        // Cargo instalación
        if (costo_instalacion > 0) {
            await conn.query(
                `INSERT INTO cargos (servicio_id, concepto_id, descripcion, monto, fecha_vencimiento, saldo_pendiente, created_by)
                 VALUES (?, ?, 'Costo de instalación', ?, ?, ?, ?)`,
                [servicioId, conceptoInstalacion[0]?.id || 3, costo_instalacion, fechaInstalacion, costo_instalacion, req.userId]
            );
        }

        // Cargo prorrateo o primera mensualidad
        if (prorrateo > 0) {
            await conn.query(
                `INSERT INTO cargos (servicio_id, concepto_id, descripcion, monto, fecha_vencimiento, periodo_mes, periodo_anio, saldo_pendiente, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [servicioId, conceptoProrrateo[0]?.id || 2, `Prorrateo ${diasProrrateo} días`, prorrateo, fechaPrimerVencimiento,
                 new Date(fechaPrimerVencimiento).getMonth() + 1, new Date(fechaPrimerVencimiento).getFullYear(), prorrateo, req.userId]
            );
        } else {
            await conn.query(
                `INSERT INTO cargos (servicio_id, concepto_id, descripcion, monto, fecha_vencimiento, periodo_mes, periodo_anio, saldo_pendiente, created_by)
                 VALUES (?, ?, 'Mensualidad', ?, ?, ?, ?, ?, ?)`,
                [servicioId, conceptoMensualidad[0]?.id || 1, tarifa[0].monto, fechaPrimerVencimiento,
                 new Date(fechaPrimerVencimiento).getMonth() + 1, new Date(fechaPrimerVencimiento).getFullYear(), tarifa[0].monto, req.userId]
            );
        }

        // Agregar equipos
        if (equipos && equipos.length > 0) {
            for (const equipo of equipos) {
                await conn.query(
                    `INSERT INTO servicio_equipos (servicio_id, tipo_equipo_id, marca_id, modelo_id, mac, ip, serie, ssid, password_equipo, fecha_asignacion, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [servicioId, equipo.tipo_equipo_id, equipo.marca_id, equipo.modelo_id, equipo.mac, equipo.ip,
                     equipo.serie, equipo.ssid, equipo.password_equipo, fechaInstalacion, req.userId]
                );
            }
        }

        await conn.commit();

        await logActividad(req.userId, 'CREAR', 'SERVICIOS', `Servicio creado: ${codigo}`, getClientIp(req));

        response.success(res, { id: servicioId, codigo, prorrateo, fecha_primer_vencimiento: fechaPrimerVencimiento }, 'Servicio creado', 201);
    } catch (error) {
        await conn.rollback();
        next(error);
    } finally {
        conn.release();
    }
};

const update = async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { id } = req.params;
        const campos = ['tecnico_instalador_id', 'dia_corte', 'pago_adelantado'];

        const [current] = await conn.query(`SELECT * FROM servicios WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (current.length === 0) {
            return response.error(res, 'Servicio no encontrado', 404);
        }

        const old = current[0];
        const updates = [];
        const values = [];
        const cambios = [];

        for (const campo of campos) {
            if (req.body[campo] !== undefined && req.body[campo] !== old[campo]) {
                updates.push(`${campo} = ?`);
                values.push(req.body[campo]);
                cambios.push({ campo, anterior: old[campo], nuevo: req.body[campo] });
            }
        }

        if (updates.length === 0) {
            return response.success(res, null, 'Sin cambios');
        }

        updates.push('updated_by = ?');
        values.push(req.userId, id);

        await conn.query(`UPDATE servicios SET ${updates.join(', ')} WHERE id = ?`, values);

        for (const cambio of cambios) {
            await conn.query(
                `INSERT INTO historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, accion, created_by)
                 VALUES ('servicios', ?, ?, ?, ?, 'UPDATE', ?)`,
                [id, cambio.campo, cambio.anterior, cambio.nuevo, req.userId]
            );
        }

        await conn.commit();

        await logActividad(req.userId, 'ACTUALIZAR', 'SERVICIOS', `Servicio actualizado: ${id}`, getClientIp(req));

        response.success(res, null, 'Servicio actualizado');
    } catch (error) {
        await conn.rollback();
        next(error);
    } finally {
        conn.release();
    }
};

const deleteServicio = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(
            `UPDATE servicios SET deleted_at = NOW(), deleted_by = ?, is_active = 0 WHERE id = ? AND deleted_at IS NULL`,
            [req.userId, id]
        );

        if (result.affectedRows === 0) {
            return response.error(res, 'Servicio no encontrado', 404);
        }

        await registrarCambio('servicios', id, 'deleted_at', null, new Date().toISOString(), 'DELETE', req.userId);
        await logActividad(req.userId, 'ELIMINAR', 'SERVICIOS', `Servicio eliminado: ${id}`, getClientIp(req));

        response.success(res, null, 'Servicio eliminado');
    } catch (error) {
        next(error);
    }
};

const getEquipos = async (req, res, next) => {
    try {
        const [equipos] = await db.query(
            `SELECT se.*, te.nombre as tipo, m.nombre as marca, mo.nombre as modelo
             FROM servicio_equipos se
             LEFT JOIN cat_tipo_equipo te ON se.tipo_equipo_id = te.id
             LEFT JOIN cat_marcas_equipo m ON se.marca_id = m.id
             LEFT JOIN cat_modelos_equipo mo ON se.modelo_id = mo.id
             WHERE se.servicio_id = ? AND se.deleted_at IS NULL
             ORDER BY se.is_active DESC, se.created_at DESC`,
            [req.params.id]
        );

        response.success(res, equipos);
    } catch (error) {
        next(error);
    }
};

const addEquipo = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { tipo_equipo_id, marca_id, modelo_id, mac, ip, serie, ssid, password_equipo } = req.body;

        const [result] = await db.query(
            `INSERT INTO servicio_equipos (servicio_id, tipo_equipo_id, marca_id, modelo_id, mac, ip, serie, ssid, password_equipo, fecha_asignacion, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)`,
            [id, tipo_equipo_id, marca_id, modelo_id, mac, ip, serie, ssid, password_equipo, req.userId]
        );

        await logActividad(req.userId, 'AGREGAR_EQUIPO', 'SERVICIOS', `Equipo agregado al servicio: ${id}`, getClientIp(req));

        response.success(res, { id: result.insertId }, 'Equipo agregado', 201);
    } catch (error) {
        next(error);
    }
};

const updateEquipo = async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { id, equipoId } = req.params;
        const campos = ['tipo_equipo_id', 'marca_id', 'modelo_id', 'mac', 'ip', 'serie', 'ssid', 'password_equipo'];

        const [current] = await conn.query(
            `SELECT * FROM servicio_equipos WHERE id = ? AND servicio_id = ?`,
            [equipoId, id]
        );

        if (current.length === 0) {
            return response.error(res, 'Equipo no encontrado', 404);
        }

        const old = current[0];
        const updates = [];
        const values = [];

        for (const campo of campos) {
            if (req.body[campo] !== undefined) {
                updates.push(`${campo} = ?`);
                values.push(req.body[campo]);

                if (req.body[campo] !== old[campo]) {
                    await conn.query(
                        `INSERT INTO historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, accion, created_by)
                         VALUES ('servicio_equipos', ?, ?, ?, ?, 'UPDATE', ?)`,
                        [equipoId, campo, old[campo], req.body[campo], req.userId]
                    );
                }
            }
        }

        if (updates.length > 0) {
            updates.push('updated_by = ?');
            values.push(req.userId, equipoId);
            await conn.query(`UPDATE servicio_equipos SET ${updates.join(', ')} WHERE id = ?`, values);
        }

        await conn.commit();

        response.success(res, null, 'Equipo actualizado');
    } catch (error) {
        await conn.rollback();
        next(error);
    } finally {
        conn.release();
    }
};

const removeEquipo = async (req, res, next) => {
    try {
        const { id, equipoId } = req.params;

        await db.query(
            `UPDATE servicio_equipos SET is_active = 0, fecha_retiro = CURDATE(), deleted_at = NOW(), deleted_by = ?
             WHERE id = ? AND servicio_id = ?`,
            [req.userId, equipoId, id]
        );

        response.success(res, null, 'Equipo retirado');
    } catch (error) {
        next(error);
    }
};

const cambiarTarifa = async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { id } = req.params;
        const { tarifa_id } = req.body;

        const [servicio] = await conn.query(`SELECT tarifa_id FROM servicios WHERE id = ?`, [id]);
        if (servicio.length === 0) {
            return response.error(res, 'Servicio no encontrado', 404);
        }

        const [tarifa] = await conn.query(`SELECT monto FROM cat_tarifas WHERE id = ?`, [tarifa_id]);
        if (tarifa.length === 0) {
            return response.error(res, 'Tarifa no encontrada', 404);
        }

        // Cerrar tarifa anterior
        await conn.query(
            `UPDATE servicio_tarifas_historial SET fecha_fin = CURDATE(), updated_by = ?
             WHERE servicio_id = ? AND fecha_fin IS NULL`,
            [req.userId, id]
        );

        // Nueva tarifa
        await conn.query(
            `INSERT INTO servicio_tarifas_historial (servicio_id, tarifa_id, fecha_inicio, monto, created_by)
             VALUES (?, ?, CURDATE(), ?, ?)`,
            [id, tarifa_id, tarifa[0].monto, req.userId]
        );

        await conn.query(
            `UPDATE servicios SET tarifa_id = ?, updated_by = ? WHERE id = ?`,
            [tarifa_id, req.userId, id]
        );

        await conn.query(
            `INSERT INTO historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, accion, created_by)
             VALUES ('servicios', ?, 'tarifa_id', ?, ?, 'UPDATE', ?)`,
            [id, servicio[0].tarifa_id, tarifa_id, req.userId]
        );

        await conn.commit();

        await logActividad(req.userId, 'CAMBIAR_TARIFA', 'SERVICIOS', `Tarifa cambiada en servicio: ${id}`, getClientIp(req));

        response.success(res, null, 'Tarifa actualizada');
    } catch (error) {
        await conn.rollback();
        next(error);
    } finally {
        conn.release();
    }
};

const suspender = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [estatusSuspendido] = await db.query(
            `SELECT id FROM cat_estatus_servicio WHERE clave = 'SUSPENDIDO' LIMIT 1`
        );

        await db.query(
            `UPDATE servicios SET estatus_id = ?, updated_by = ? WHERE id = ?`,
            [estatusSuspendido[0].id, req.userId, id]
        );

        await logActividad(req.userId, 'SUSPENDER', 'SERVICIOS', `Servicio suspendido: ${id}`, getClientIp(req));

        response.success(res, null, 'Servicio suspendido');
    } catch (error) {
        next(error);
    }
};

const reactivar = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { generar_cargo_reconexion = false } = req.body;

        const [estatusActivo] = await db.query(
            `SELECT id FROM cat_estatus_servicio WHERE clave = 'ACTIVO' LIMIT 1`
        );

        await db.query(
            `UPDATE servicios SET estatus_id = ?, updated_by = ? WHERE id = ?`,
            [estatusActivo[0].id, req.userId, id]
        );

        if (generar_cargo_reconexion) {
            const [cargoReconexion] = await db.query(
                `SELECT id, monto_default FROM cat_cargos_tipo WHERE clave = 'RECONEXION' LIMIT 1`
            );

            if (cargoReconexion.length > 0) {
                await db.query(
                    `INSERT INTO cargos (servicio_id, concepto_id, cargo_tipo_id, descripcion, monto, fecha_vencimiento, saldo_pendiente, created_by)
                     VALUES (?, (SELECT id FROM cat_conceptos_cobro LIMIT 1), ?, 'Cargo por reconexión', ?, CURDATE(), ?, ?)`,
                    [id, cargoReconexion[0].id, cargoReconexion[0].monto_default, cargoReconexion[0].monto_default, req.userId]
                );
            }
        }

        await logActividad(req.userId, 'REACTIVAR', 'SERVICIOS', `Servicio reactivado: ${id}`, getClientIp(req));

        response.success(res, null, 'Servicio reactivado');
    } catch (error) {
        next(error);
    }
};

const cancelar = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { motivo_cancelacion_id } = req.body;

        const [estatusCancelado] = await db.query(
            `SELECT id FROM cat_estatus_servicio WHERE clave = 'CANCELADO' LIMIT 1`
        );

        await db.query(
            `UPDATE servicios SET estatus_id = ?, fecha_cancelacion = CURDATE(), motivo_cancelacion_id = ?, updated_by = ?
             WHERE id = ?`,
            [estatusCancelado[0].id, motivo_cancelacion_id, req.userId, id]
        );

        await logActividad(req.userId, 'CANCELAR', 'SERVICIOS', `Servicio cancelado: ${id}`, getClientIp(req));

        response.success(res, null, 'Servicio cancelado');
    } catch (error) {
        next(error);
    }
};

const getHistorial = async (req, res, next) => {
    try {
        const [historial] = await db.query(
            `SELECT h.*, u.nombre as usuario
             FROM historial_cambios h
             LEFT JOIN usuarios u ON h.created_by = u.id
             WHERE h.tabla = 'servicios' AND h.registro_id = ?
             ORDER BY h.created_at DESC`,
            [req.params.id]
        );

        response.success(res, historial);
    } catch (error) {
        next(error);
    }
};

const getHistorialTarifas = async (req, res, next) => {
    try {
        const [historial] = await db.query(
            `SELECT sth.*, t.nombre as tarifa, t.velocidad_mbps
             FROM servicio_tarifas_historial sth
             LEFT JOIN cat_tarifas t ON sth.tarifa_id = t.id
             WHERE sth.servicio_id = ? AND sth.deleted_at IS NULL
             ORDER BY sth.fecha_inicio DESC`,
            [req.params.id]
        );

        response.success(res, historial);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAll, getById, create, update, delete: deleteServicio,
    getEquipos, addEquipo, updateEquipo, removeEquipo,
    cambiarTarifa, suspender, reactivar, cancelar,
    getHistorial, getHistorialTarifas
};

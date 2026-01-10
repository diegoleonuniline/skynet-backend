const db = require('../config/database');
const { registrarCambio, logActividad, getClientIp, generarCodigo, paginate, response } = require('../utils/helpers');

const getAll = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search, estatus_id, zona_id, ciudad_id } = req.query;
        const { limit: lim, offset } = paginate(page, limit);

        let where = 'WHERE c.deleted_at IS NULL';
        const params = [];

        if (req.userZonas && req.userZonas.length > 0) {
            where += ` AND c.zona_id IN (${req.userZonas.map(() => '?').join(',')})`;
            params.push(...req.userZonas);
        }

        if (search) {
            where += ` AND (c.nombre LIKE ? OR c.apellido_paterno LIKE ? OR c.codigo LIKE ? OR c.telefono1 LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (estatus_id) {
            where += ` AND c.estatus_id = ?`;
            params.push(estatus_id);
        }
        if (zona_id) {
            where += ` AND c.zona_id = ?`;
            params.push(zona_id);
        }
        if (ciudad_id) {
            where += ` AND c.ciudad_id = ?`;
            params.push(ciudad_id);
        }

        const [total] = await db.query(`SELECT COUNT(*) as total FROM clientes c ${where}`, params);

        const [clientes] = await db.query(
            `SELECT c.id, c.codigo, c.nombre, c.apellido_paterno, c.apellido_materno,
                    c.telefono1, c.telefono2, c.calle, c.numero_exterior,
                    ec.nombre as estatus, ec.color as estatus_color,
                    ci.nombre as ciudad, z.nombre as zona,
                    (SELECT COUNT(*) FROM servicios s WHERE s.cliente_id = c.id AND s.is_active = 1) as total_servicios
             FROM clientes c
             LEFT JOIN cat_estatus_cliente ec ON c.estatus_id = ec.id
             LEFT JOIN cat_ciudades ci ON c.ciudad_id = ci.id
             LEFT JOIN cat_zonas z ON c.zona_id = z.id
             ${where}
             ORDER BY c.nombre, c.apellido_paterno
             LIMIT ? OFFSET ?`,
            [...params, lim, offset]
        );

        response.paginated(res, clientes, total[0].total, page, limit);
    } catch (error) {
        next(error);
    }
};

const buscar = async (req, res, next) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return response.success(res, []);
        }

        let where = `WHERE c.deleted_at IS NULL AND (c.nombre LIKE ? OR c.apellido_paterno LIKE ? OR c.codigo LIKE ? OR c.telefono1 LIKE ?)`;
        const params = [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`];

        if (req.userZonas && req.userZonas.length > 0) {
            where += ` AND c.zona_id IN (${req.userZonas.map(() => '?').join(',')})`;
            params.push(...req.userZonas);
        }

        const [clientes] = await db.query(
            `SELECT c.id, c.codigo, c.nombre, c.apellido_paterno, c.apellido_materno, c.telefono1
             FROM clientes c ${where} LIMIT 20`,
            params
        );

        response.success(res, clientes);
    } catch (error) {
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const [clientes] = await db.query(
            `SELECT c.*, ec.nombre as estatus, ec.color as estatus_color,
                    e.nombre as estado, ci.nombre as ciudad, col.nombre as colonia,
                    z.nombre as zona, mc.nombre as motivo_cancelacion
             FROM clientes c
             LEFT JOIN cat_estatus_cliente ec ON c.estatus_id = ec.id
             LEFT JOIN cat_estados e ON c.estado_id = e.id
             LEFT JOIN cat_ciudades ci ON c.ciudad_id = ci.id
             LEFT JOIN cat_colonias col ON c.colonia_id = col.id
             LEFT JOIN cat_zonas z ON c.zona_id = z.id
             LEFT JOIN cat_motivos_cancelacion mc ON c.motivo_cancelacion_id = mc.id
             WHERE c.id = ? AND c.deleted_at IS NULL`,
            [req.params.id]
        );

        if (clientes.length === 0) {
            return response.error(res, 'Cliente no encontrado', 404);
        }

        const [servicios] = await db.query(
            `SELECT s.*, t.nombre as tarifa, t.monto as tarifa_monto,
                    es.nombre as estatus, es.color as estatus_color
             FROM servicios s
             LEFT JOIN cat_tarifas t ON s.tarifa_id = t.id
             LEFT JOIN cat_estatus_servicio es ON s.estatus_id = es.id
             WHERE s.cliente_id = ? AND s.deleted_at IS NULL`,
            [req.params.id]
        );

        response.success(res, { ...clientes[0], servicios });
    } catch (error) {
        next(error);
    }
};

const create = async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const {
            nombre, apellido_paterno, apellido_materno,
            telefono1, telefono2, telefono3_subcliente,
            calle, numero_exterior, numero_interior,
            colonia_id, ciudad_id, estado_id, codigo_postal, zona_id
        } = req.body;

        if (!nombre) {
            return response.error(res, 'El nombre es requerido', 400);
        }

        const codigo = await generarCodigo('clientes', 'CLI');

        const [estatusActivo] = await conn.query(
            `SELECT id FROM cat_estatus_cliente WHERE clave = 'ACTIVO' LIMIT 1`
        );

        const [result] = await conn.query(
            `INSERT INTO clientes (codigo, nombre, apellido_paterno, apellido_materno,
             telefono1, telefono2, telefono3_subcliente, calle, numero_exterior, numero_interior,
             colonia_id, ciudad_id, estado_id, codigo_postal, zona_id, estatus_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [codigo, nombre, apellido_paterno, apellido_materno, telefono1, telefono2, telefono3_subcliente,
             calle, numero_exterior, numero_interior, colonia_id, ciudad_id, estado_id, codigo_postal,
             zona_id, estatusActivo[0]?.id || 1, req.userId]
        );

        await conn.commit();

        await logActividad(req.userId, 'CREAR', 'CLIENTES', `Cliente creado: ${codigo}`, getClientIp(req));

        response.success(res, { id: result.insertId, codigo }, 'Cliente creado', 201);
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
        const campos = [
            'nombre', 'apellido_paterno', 'apellido_materno',
            'telefono1', 'telefono2', 'telefono3_subcliente',
            'calle', 'numero_exterior', 'numero_interior',
            'colonia_id', 'ciudad_id', 'estado_id', 'codigo_postal', 'zona_id'
        ];

        const [current] = await conn.query(`SELECT * FROM clientes WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (current.length === 0) {
            return response.error(res, 'Cliente no encontrado', 404);
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

        await conn.query(`UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`, values);

        for (const cambio of cambios) {
            await conn.query(
                `INSERT INTO historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, accion, created_by, ip_address)
                 VALUES ('clientes', ?, ?, ?, ?, 'UPDATE', ?, ?)`,
                [id, cambio.campo, cambio.anterior, cambio.nuevo, req.userId, getClientIp(req)]
            );
        }

        await conn.commit();

        await logActividad(req.userId, 'ACTUALIZAR', 'CLIENTES', `Cliente actualizado: ${id}`, getClientIp(req));

        response.success(res, null, 'Cliente actualizado');
    } catch (error) {
        await conn.rollback();
        next(error);
    } finally {
        conn.release();
    }
};

const deleteCliente = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(
            `UPDATE clientes SET deleted_at = NOW(), deleted_by = ?, is_active = 0 WHERE id = ? AND deleted_at IS NULL`,
            [req.userId, id]
        );

        if (result.affectedRows === 0) {
            return response.error(res, 'Cliente no encontrado', 404);
        }

        await registrarCambio('clientes', id, 'deleted_at', null, new Date().toISOString(), 'DELETE', req.userId, getClientIp(req));
        await logActividad(req.userId, 'ELIMINAR', 'CLIENTES', `Cliente eliminado: ${id}`, getClientIp(req));

        response.success(res, null, 'Cliente eliminado');
    } catch (error) {
        next(error);
    }
};

const uploadINE = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { tipo } = req.body; // FRENTE o REVERSO

        if (!req.file) {
            return response.error(res, 'Archivo requerido', 400);
        }

        if (!tipo || !['FRENTE', 'REVERSO'].includes(tipo)) {
            return response.error(res, 'Tipo debe ser FRENTE o REVERSO', 400);
        }

        await db.query(
            `UPDATE cliente_ine SET is_active = 0, deleted_at = NOW(), deleted_by = ?
             WHERE cliente_id = ? AND tipo = ? AND is_active = 1`,
            [req.userId, id, tipo]
        );

        await db.query(
            `INSERT INTO cliente_ine (cliente_id, tipo, archivo_nombre, archivo_path, archivo_size, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, tipo, req.file.originalname, req.file.path, req.file.size, req.userId]
        );

        await logActividad(req.userId, 'SUBIR_INE', 'CLIENTES', `INE ${tipo} subida para cliente: ${id}`, getClientIp(req));

        response.success(res, { path: req.file.path }, 'INE subida');
    } catch (error) {
        next(error);
    }
};

const getINE = async (req, res, next) => {
    try {
        const [ines] = await db.query(
            `SELECT id, tipo, archivo_nombre, archivo_path, created_at
             FROM cliente_ine WHERE cliente_id = ? AND is_active = 1 AND deleted_at IS NULL`,
            [req.params.id]
        );

        response.success(res, ines);
    } catch (error) {
        next(error);
    }
};

const deleteINE = async (req, res, next) => {
    try {
        const { id, ineId } = req.params;

        await db.query(
            `UPDATE cliente_ine SET is_active = 0, deleted_at = NOW(), deleted_by = ?
             WHERE id = ? AND cliente_id = ?`,
            [req.userId, ineId, id]
        );

        response.success(res, null, 'INE eliminada');
    } catch (error) {
        next(error);
    }
};

const getNotas = async (req, res, next) => {
    try {
        const [notas] = await db.query(
            `SELECT n.*, u.nombre as creado_por
             FROM cliente_notas n
             LEFT JOIN usuarios u ON n.created_by = u.id
             WHERE n.cliente_id = ? AND n.is_active = 1 AND n.deleted_at IS NULL
             ORDER BY n.created_at DESC`,
            [req.params.id]
        );

        response.success(res, notas);
    } catch (error) {
        next(error);
    }
};

const addNota = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { nota } = req.body;

        if (!nota) {
            return response.error(res, 'Nota requerida', 400);
        }

        const [result] = await db.query(
            `INSERT INTO cliente_notas (cliente_id, nota, created_by) VALUES (?, ?, ?)`,
            [id, nota, req.userId]
        );

        response.success(res, { id: result.insertId }, 'Nota agregada', 201);
    } catch (error) {
        next(error);
    }
};

const deleteNota = async (req, res, next) => {
    try {
        const { id, notaId } = req.params;

        await db.query(
            `UPDATE cliente_notas SET is_active = 0, deleted_at = NOW(), deleted_by = ?
             WHERE id = ? AND cliente_id = ?`,
            [req.userId, notaId, id]
        );

        response.success(res, null, 'Nota eliminada');
    } catch (error) {
        next(error);
    }
};

const getHistorial = async (req, res, next) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const { limit: lim, offset } = paginate(page, limit);

        const [historial] = await db.query(
            `SELECT h.*, u.nombre as usuario
             FROM historial_cambios h
             LEFT JOIN usuarios u ON h.created_by = u.id
             WHERE h.tabla = 'clientes' AND h.registro_id = ?
             ORDER BY h.created_at DESC
             LIMIT ? OFFSET ?`,
            [req.params.id, lim, offset]
        );

        response.success(res, historial);
    } catch (error) {
        next(error);
    }
};

const cancelar = async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { id } = req.params;
        const { motivo_cancelacion_id } = req.body;

        const [estatusCancelado] = await conn.query(
            `SELECT id FROM cat_estatus_cliente WHERE clave = 'CANCELADO' LIMIT 1`
        );

        await conn.query(
            `UPDATE clientes SET estatus_id = ?, fecha_cancelacion = CURDATE(), motivo_cancelacion_id = ?, updated_by = ?
             WHERE id = ?`,
            [estatusCancelado[0].id, motivo_cancelacion_id, req.userId, id]
        );

        await conn.query(
            `UPDATE servicios SET estatus_id = (SELECT id FROM cat_estatus_servicio WHERE clave = 'CANCELADO'),
             fecha_cancelacion = CURDATE(), motivo_cancelacion_id = ?, updated_by = ?
             WHERE cliente_id = ? AND deleted_at IS NULL`,
            [motivo_cancelacion_id, req.userId, id]
        );

        await conn.commit();

        await logActividad(req.userId, 'CANCELAR', 'CLIENTES', `Cliente cancelado: ${id}`, getClientIp(req));

        response.success(res, null, 'Cliente cancelado');
    } catch (error) {
        await conn.rollback();
        next(error);
    } finally {
        conn.release();
    }
};

const reactivar = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [estatusActivo] = await db.query(
            `SELECT id FROM cat_estatus_cliente WHERE clave = 'ACTIVO' LIMIT 1`
        );

        await db.query(
            `UPDATE clientes SET estatus_id = ?, fecha_cancelacion = NULL, motivo_cancelacion_id = NULL, updated_by = ?
             WHERE id = ?`,
            [estatusActivo[0].id, req.userId, id]
        );

        await logActividad(req.userId, 'REACTIVAR', 'CLIENTES', `Cliente reactivado: ${id}`, getClientIp(req));

        response.success(res, null, 'Cliente reactivado');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAll, buscar, getById, create, update, delete: deleteCliente,
    uploadINE, getINE, deleteINE,
    getNotas, addNota, deleteNota,
    getHistorial, cancelar, reactivar
};

const db = require('../config/database');
const { paginate, response } = require('../utils/helpers');

const getAll = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, fecha_desde, fecha_hasta, accion } = req.query;
        const { limit: lim, offset } = paginate(page, limit);

        let where = 'WHERE 1=1';
        const params = [];

        if (fecha_desde) {
            where += ` AND DATE(h.created_at) >= ?`;
            params.push(fecha_desde);
        }
        if (fecha_hasta) {
            where += ` AND DATE(h.created_at) <= ?`;
            params.push(fecha_hasta);
        }
        if (accion) {
            where += ` AND h.accion = ?`;
            params.push(accion);
        }

        const [total] = await db.query(`SELECT COUNT(*) as total FROM historial_cambios h ${where}`, params);

        const [data] = await db.query(
            `SELECT h.*, u.nombre as usuario_nombre, u.username
             FROM historial_cambios h
             LEFT JOIN usuarios u ON h.created_by = u.id
             ${where}
             ORDER BY h.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, lim, offset]
        );

        response.paginated(res, data, total[0].total, page, limit);
    } catch (error) {
        next(error);
    }
};

const getByTabla = async (req, res, next) => {
    try {
        const { tabla } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const { limit: lim, offset } = paginate(page, limit);

        const [total] = await db.query(
            `SELECT COUNT(*) as total FROM historial_cambios WHERE tabla = ?`,
            [tabla]
        );

        const [data] = await db.query(
            `SELECT h.*, u.nombre as usuario_nombre
             FROM historial_cambios h
             LEFT JOIN usuarios u ON h.created_by = u.id
             WHERE h.tabla = ?
             ORDER BY h.created_at DESC
             LIMIT ? OFFSET ?`,
            [tabla, lim, offset]
        );

        response.paginated(res, data, total[0].total, page, limit);
    } catch (error) {
        next(error);
    }
};

const getByRegistro = async (req, res, next) => {
    try {
        const { tabla, id } = req.params;

        const [data] = await db.query(
            `SELECT h.*, u.nombre as usuario_nombre
             FROM historial_cambios h
             LEFT JOIN usuarios u ON h.created_by = u.id
             WHERE h.tabla = ? AND h.registro_id = ?
             ORDER BY h.created_at DESC`,
            [tabla, id]
        );

        response.success(res, data);
    } catch (error) {
        next(error);
    }
};

const getByUsuario = async (req, res, next) => {
    try {
        const { usuarioId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const { limit: lim, offset } = paginate(page, limit);

        const [total] = await db.query(
            `SELECT COUNT(*) as total FROM historial_cambios WHERE created_by = ?`,
            [usuarioId]
        );

        const [data] = await db.query(
            `SELECT * FROM historial_cambios WHERE created_by = ?
             ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [usuarioId, lim, offset]
        );

        response.paginated(res, data, total[0].total, page, limit);
    } catch (error) {
        next(error);
    }
};

module.exports = { getAll, getByTabla, getByRegistro, getByUsuario };

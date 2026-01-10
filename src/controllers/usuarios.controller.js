const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { registrarCambio, logActividad, getClientIp, paginate, response } = require('../utils/helpers');

const getAll = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search, rol_id, is_active } = req.query;
        const { limit: lim, offset } = paginate(page, limit);

        let where = 'WHERE u.deleted_at IS NULL';
        const params = [];

        if (search) {
            where += ` AND (u.nombre LIKE ? OR u.username LIKE ? OR u.email LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (rol_id) {
            where += ` AND u.rol_id = ?`;
            params.push(rol_id);
        }
        if (is_active !== undefined) {
            where += ` AND u.is_active = ?`;
            params.push(is_active);
        }

        const [total] = await db.query(
            `SELECT COUNT(*) as total FROM usuarios u ${where}`,
            params
        );

        const [usuarios] = await db.query(
            `SELECT u.id, u.username, u.nombre, u.apellido_paterno, u.apellido_materno,
                    u.email, u.telefono, u.is_active, u.ultimo_acceso, u.created_at,
                    r.id as rol_id, r.nombre as rol_nombre,
                    GROUP_CONCAT(z.nombre) as zonas
             FROM usuarios u
             LEFT JOIN cat_roles r ON u.rol_id = r.id
             LEFT JOIN usuario_zonas uz ON u.id = uz.usuario_id AND uz.is_active = 1
             LEFT JOIN cat_zonas z ON uz.zona_id = z.id
             ${where}
             GROUP BY u.id
             ORDER BY u.nombre
             LIMIT ? OFFSET ?`,
            [...params, lim, offset]
        );

        response.paginated(res, usuarios, total[0].total, page, limit);
    } catch (error) {
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const [usuarios] = await db.query(
            `SELECT u.id, u.username, u.nombre, u.apellido_paterno, u.apellido_materno,
                    u.email, u.telefono, u.is_active, u.ultimo_acceso, u.created_at,
                    r.id as rol_id, r.nombre as rol_nombre
             FROM usuarios u
             LEFT JOIN cat_roles r ON u.rol_id = r.id
             WHERE u.id = ? AND u.deleted_at IS NULL`,
            [req.params.id]
        );

        if (usuarios.length === 0) {
            return response.error(res, 'Usuario no encontrado', 404);
        }

        const [zonas] = await db.query(
            `SELECT z.id, z.nombre FROM usuario_zonas uz
             JOIN cat_zonas z ON uz.zona_id = z.id
             WHERE uz.usuario_id = ? AND uz.is_active = 1`,
            [req.params.id]
        );

        response.success(res, { ...usuarios[0], zonas });
    } catch (error) {
        next(error);
    }
};

const create = async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { username, password, nombre, apellido_paterno, apellido_materno, email, telefono, rol_id, zonas } = req.body;

        if (!username || !password || !nombre || !rol_id) {
            return response.error(res, 'Campos requeridos: username, password, nombre, rol_id', 400);
        }

        const hash = await bcrypt.hash(password, 10);

        const [result] = await conn.query(
            `INSERT INTO usuarios (username, password_hash, nombre, apellido_paterno, apellido_materno, email, telefono, rol_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [username, hash, nombre, apellido_paterno, apellido_materno, email, telefono, rol_id, req.userId]
        );

        const userId = result.insertId;

        if (zonas && zonas.length > 0) {
            for (const zonaId of zonas) {
                await conn.query(
                    `INSERT INTO usuario_zonas (usuario_id, zona_id, created_by) VALUES (?, ?, ?)`,
                    [userId, zonaId, req.userId]
                );
            }
        }

        await conn.commit();

        await logActividad(req.userId, 'CREAR', 'USUARIOS', `Usuario creado: ${username}`, getClientIp(req));

        response.success(res, { id: userId }, 'Usuario creado', 201);
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
        const { nombre, apellido_paterno, apellido_materno, email, telefono, rol_id, is_active } = req.body;

        const [current] = await conn.query(`SELECT * FROM usuarios WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (current.length === 0) {
            return response.error(res, 'Usuario no encontrado', 404);
        }

        const old = current[0];
        const cambios = [];

        if (nombre !== undefined && nombre !== old.nombre) cambios.push({ campo: 'nombre', anterior: old.nombre, nuevo: nombre });
        if (apellido_paterno !== undefined && apellido_paterno !== old.apellido_paterno) cambios.push({ campo: 'apellido_paterno', anterior: old.apellido_paterno, nuevo: apellido_paterno });
        if (apellido_materno !== undefined && apellido_materno !== old.apellido_materno) cambios.push({ campo: 'apellido_materno', anterior: old.apellido_materno, nuevo: apellido_materno });
        if (email !== undefined && email !== old.email) cambios.push({ campo: 'email', anterior: old.email, nuevo: email });
        if (telefono !== undefined && telefono !== old.telefono) cambios.push({ campo: 'telefono', anterior: old.telefono, nuevo: telefono });
        if (rol_id !== undefined && rol_id !== old.rol_id) cambios.push({ campo: 'rol_id', anterior: old.rol_id, nuevo: rol_id });
        if (is_active !== undefined && is_active !== old.is_active) cambios.push({ campo: 'is_active', anterior: old.is_active, nuevo: is_active });

        await conn.query(
            `UPDATE usuarios SET nombre = COALESCE(?, nombre), apellido_paterno = COALESCE(?, apellido_paterno),
             apellido_materno = COALESCE(?, apellido_materno), email = COALESCE(?, email),
             telefono = COALESCE(?, telefono), rol_id = COALESCE(?, rol_id), is_active = COALESCE(?, is_active),
             updated_by = ? WHERE id = ?`,
            [nombre, apellido_paterno, apellido_materno, email, telefono, rol_id, is_active, req.userId, id]
        );

        for (const cambio of cambios) {
            await conn.query(
                `INSERT INTO historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, accion, created_by)
                 VALUES ('usuarios', ?, ?, ?, ?, 'UPDATE', ?)`,
                [id, cambio.campo, cambio.anterior, cambio.nuevo, req.userId]
            );
        }

        await conn.commit();

        await logActividad(req.userId, 'ACTUALIZAR', 'USUARIOS', `Usuario actualizado: ${id}`, getClientIp(req));

        response.success(res, null, 'Usuario actualizado');
    } catch (error) {
        await conn.rollback();
        next(error);
    } finally {
        conn.release();
    }
};

const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(
            `UPDATE usuarios SET deleted_at = NOW(), deleted_by = ?, is_active = 0 WHERE id = ? AND deleted_at IS NULL`,
            [req.userId, id]
        );

        if (result.affectedRows === 0) {
            return response.error(res, 'Usuario no encontrado', 404);
        }

        await registrarCambio('usuarios', id, 'deleted_at', null, new Date().toISOString(), 'DELETE', req.userId);
        await logActividad(req.userId, 'ELIMINAR', 'USUARIOS', `Usuario eliminado: ${id}`, getClientIp(req));

        response.success(res, null, 'Usuario eliminado');
    } catch (error) {
        next(error);
    }
};

const asignarZonas = async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { id } = req.params;
        const { zonas } = req.body;

        await conn.query(
            `UPDATE usuario_zonas SET is_active = 0, deleted_at = NOW(), deleted_by = ? WHERE usuario_id = ?`,
            [req.userId, id]
        );

        if (zonas && zonas.length > 0) {
            for (const zonaId of zonas) {
                await conn.query(
                    `INSERT INTO usuario_zonas (usuario_id, zona_id, created_by) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE is_active = 1, deleted_at = NULL, updated_by = ?`,
                    [id, zonaId, req.userId, req.userId]
                );
            }
        }

        await conn.commit();

        await logActividad(req.userId, 'ASIGNAR_ZONAS', 'USUARIOS', `Zonas asignadas a usuario: ${id}`, getClientIp(req));

        response.success(res, null, 'Zonas asignadas');
    } catch (error) {
        await conn.rollback();
        next(error);
    } finally {
        conn.release();
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { password } = req.body;

        if (!password || password.length < 6) {
            return response.error(res, 'Contraseña debe tener al menos 6 caracteres', 400);
        }

        const hash = await bcrypt.hash(password, 10);
        await db.query(
            `UPDATE usuarios SET password_hash = ?, updated_by = ? WHERE id = ?`,
            [hash, req.userId, id]
        );

        await logActividad(req.userId, 'RESET_PASSWORD', 'USUARIOS', `Password reseteado para usuario: ${id}`, getClientIp(req));

        response.success(res, null, 'Contraseña reseteada');
    } catch (error) {
        next(error);
    }
};

module.exports = { getAll, getById, create, update, delete: deleteUser, asignarZonas, resetPassword };

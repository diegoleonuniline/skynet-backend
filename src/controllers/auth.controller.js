const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { logActividad, getClientIp, response } = require('../utils/helpers');

const login = async (req, res, next) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return response.error(res, 'Usuario y contraseña requeridos', 400);
        }

        const [users] = await db.query(
            `SELECT u.*, r.nombre as rol_nombre 
             FROM usuarios u 
             JOIN cat_roles r ON u.rol_id = r.id 
             WHERE u.username = ? AND u.is_active = 1 AND u.deleted_at IS NULL`,
            [username]
        );

        if (users.length === 0) {
            return response.error(res, 'Credenciales inválidas', 401);
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return response.error(res, 'Credenciales inválidas', 401);
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, rol: user.rol_nombre },
            process.env.JWT_SECRETO,
            { expiresIn: '24h' }
        );

        const sessionToken = uuidv4();
        const ip = getClientIp(req);
        const userAgent = req.headers['user-agent'];

        await db.query(
            `INSERT INTO sesiones (usuario_id, token, ip_address, user_agent, fecha_expiracion)
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
            [user.id, sessionToken, ip, userAgent]
        );

        await db.query(
            `UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?`,
            [user.id]
        );

        await logActividad(user.id, 'LOGIN', 'AUTH', 'Inicio de sesión exitoso', ip, userAgent);

        const [permisos] = await db.query(
            `SELECT p.modulo, p.accion FROM rol_permisos rp
             JOIN cat_permisos p ON rp.permiso_id = p.id
             WHERE rp.rol_id = ? AND rp.is_active = 1 AND p.is_active = 1`,
            [user.rol_id]
        );

        const [zonas] = await db.query(
            `SELECT z.id, z.nombre FROM usuario_zonas uz
             JOIN cat_zonas z ON uz.zona_id = z.id
             WHERE uz.usuario_id = ? AND uz.is_active = 1`,
            [user.id]
        );

        response.success(res, {
            token,
            user: {
                id: user.id,
                username: user.username,
                nombre: user.nombre,
                apellido_paterno: user.apellido_paterno,
                apellido_materno: user.apellido_materno,
                email: user.email,
                rol: user.rol_nombre,
                rol_id: user.rol_id
            },
            permisos,
            zonas
        }, 'Login exitoso');

    } catch (error) {
        next(error);
    }
};

const logout = async (req, res, next) => {
    try {
        const ip = getClientIp(req);
        const userAgent = req.headers['user-agent'];

        await db.query(
            `UPDATE sesiones SET is_active = 0 WHERE usuario_id = ? AND is_active = 1`,
            [req.userId]
        );

        await logActividad(req.userId, 'LOGOUT', 'AUTH', 'Cierre de sesión', ip, userAgent);

        response.success(res, null, 'Sesión cerrada');
    } catch (error) {
        next(error);
    }
};

const me = async (req, res, next) => {
    try {
        const [permisos] = await db.query(
            `SELECT p.modulo, p.accion FROM rol_permisos rp
             JOIN cat_permisos p ON rp.permiso_id = p.id
             WHERE rp.rol_id = ? AND rp.is_active = 1 AND p.is_active = 1`,
            [req.user.rol_id]
        );

        const [zonas] = await db.query(
            `SELECT z.id, z.nombre FROM usuario_zonas uz
             JOIN cat_zonas z ON uz.zona_id = z.id
             WHERE uz.usuario_id = ? AND uz.is_active = 1`,
            [req.userId]
        );

        response.success(res, {
            user: {
                id: req.user.id,
                username: req.user.username,
                nombre: req.user.nombre,
                apellido_paterno: req.user.apellido_paterno,
                apellido_materno: req.user.apellido_materno,
                email: req.user.email,
                rol: req.user.rol_nombre,
                rol_id: req.user.rol_id
            },
            permisos,
            zonas
        });
    } catch (error) {
        next(error);
    }
};

const cambiarPassword = async (req, res, next) => {
    try {
        const { password_actual, password_nuevo } = req.body;

        if (!password_actual || !password_nuevo) {
            return response.error(res, 'Contraseñas requeridas', 400);
        }

        if (password_nuevo.length < 6) {
            return response.error(res, 'La contraseña debe tener al menos 6 caracteres', 400);
        }

        const [users] = await db.query(
            `SELECT password_hash FROM usuarios WHERE id = ?`,
            [req.userId]
        );

        const validPassword = await bcrypt.compare(password_actual, users[0].password_hash);
        if (!validPassword) {
            return response.error(res, 'Contraseña actual incorrecta', 401);
        }

        const hash = await bcrypt.hash(password_nuevo, 10);
        await db.query(
            `UPDATE usuarios SET password_hash = ?, updated_by = ? WHERE id = ?`,
            [hash, req.userId, req.userId]
        );

        await logActividad(req.userId, 'CAMBIO_PASSWORD', 'AUTH', 'Cambio de contraseña', getClientIp(req));

        response.success(res, null, 'Contraseña actualizada');
    } catch (error) {
        next(error);
    }
};

const refreshToken = async (req, res, next) => {
    try {
        const token = jwt.sign(
            { id: req.user.id, username: req.user.username, rol: req.user.rol_nombre },
            process.env.JWT_SECRETO,
            { expiresIn: '24h' }
        );

        response.success(res, { token }, 'Token renovado');
    } catch (error) {
        next(error);
    }
};

module.exports = { login, logout, me, cambiarPassword, refreshToken };

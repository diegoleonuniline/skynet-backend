const jwt = require('jsonwebtoken');
const db = require('../config/database');

const auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Token no proporcionado' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRETO);

        const [users] = await db.query(
            `SELECT u.*, r.nombre as rol_nombre 
             FROM usuarios u 
             JOIN cat_roles r ON u.rol_id = r.id 
             WHERE u.id = ? AND u.is_active = 1 AND u.deleted_at IS NULL`,
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Usuario no válido' });
        }

        req.user = users[0];
        req.userId = decoded.id;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expirado' });
        }
        return res.status(401).json({ success: false, message: 'Token inválido' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user.rol_nombre !== 'ADMIN') {
        return res.status(403).json({ success: false, message: 'Acceso denegado: Se requiere rol ADMIN' });
    }
    next();
};

const hasPermission = (modulo, accion) => {
    return async (req, res, next) => {
        try {
            if (req.user.rol_nombre === 'ADMIN') {
                return next();
            }

            const [permisos] = await db.query(
                `SELECT 1 FROM rol_permisos rp
                 JOIN cat_permisos p ON rp.permiso_id = p.id
                 WHERE rp.rol_id = ? AND p.modulo = ? AND p.accion = ?
                 AND rp.is_active = 1 AND p.is_active = 1`,
                [req.user.rol_id, modulo, accion]
            );

            if (permisos.length === 0) {
                return res.status(403).json({ success: false, message: 'Sin permiso para esta acción' });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

const canAccessZone = async (req, res, next) => {
    try {
        if (req.user.rol_nombre === 'ADMIN') {
            return next();
        }

        const [zonas] = await db.query(
            `SELECT zona_id FROM usuario_zonas WHERE usuario_id = ? AND is_active = 1`,
            [req.userId]
        );

        req.userZonas = zonas.map(z => z.zona_id);
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = { auth, isAdmin, hasPermission, canAccessZone };

const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const verificarToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token no proporcionado'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRETO || 'skynet_secreto_2024');
    
    const [users] = await pool.query(
      `SELECT u.*, r.nombre as rol_nombre
       FROM usuarios u
       LEFT JOIN usuarios_roles ur ON u.id = ur.usuario_id
       LEFT JOIN catalogo_roles r ON ur.rol_id = r.id
       WHERE u.id = ? AND u.activo = 1`,
      [decoded.userId]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado o inactivo'
      });
    }
    
    req.user = users[0];
    req.userId = users[0].id;
    next();
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
  }
};

module.exports = { verificarToken };

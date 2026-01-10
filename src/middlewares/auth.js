const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token no proporcionado' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRETO);
    
    const [users] = await pool.query(
      `SELECT u.*, r.nombre as rol_nombre, eu.nombre as estado_nombre
       FROM usuarios u 
       JOIN cat_roles r ON u.rol_id = r.id 
       JOIN cat_estados_usuario eu ON u.estado_id = eu.id
       WHERE u.id = ? AND eu.nombre = 'Activo'`,
      [decoded.userId]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no válido' 
      });
    }
    
    req.user = users[0];
    req.userId = decoded.userId;
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

module.exports = { verificarToken: authMiddleware };

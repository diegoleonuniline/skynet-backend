const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Usuario y contraseña son requeridos'
      });
    }
    
    // Buscar usuario por email (username = email en este sistema)
    const [users] = await pool.query(
      `SELECT u.*, r.nombre as rol_nombre
       FROM usuarios u
       LEFT JOIN usuarios_roles ur ON u.id = ur.usuario_id
       LEFT JOIN catalogo_roles r ON ur.rol_id = r.id
       WHERE u.email = ? AND u.activo = 1`,
      [username]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }
    
    const user = users[0];
    
    // Comparar contraseña
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }
    
    // Generar token
    const token = jwt.sign(
      { userId: user.id, rol: user.rol_nombre || 'Empleado' },
      process.env.JWT_SECRETO || 'skynet_secreto_2024',
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          nombre_completo: user.nombre,
          email: user.email,
          rol: user.rol_nombre || 'Empleado'
        }
      }
    });
    
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

const perfil = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        id: req.user.id,
        nombre_completo: req.user.nombre,
        email: req.user.email,
        rol: req.user.rol_nombre || 'Empleado'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener perfil'
    });
  }
};

const cambiarPassword = async (req, res) => {
  try {
    const { password_actual, password_nuevo } = req.body;
    
    if (!password_actual || !password_nuevo) {
      return res.status(400).json({
        success: false,
        message: 'Contraseña actual y nueva son requeridas'
      });
    }
    
    if (password_nuevo.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }
    
    const [users] = await pool.query(
      'SELECT password FROM usuarios WHERE id = ?',
      [req.userId]
    );
    
    const validPassword = await bcrypt.compare(password_actual, users[0].password);
    
    if (!validPassword) {
      return res.status(400).json({
        success: false,
        message: 'Contraseña actual incorrecta'
      });
    }
    
    const newHash = await bcrypt.hash(password_nuevo, 10);
    
    await pool.query(
      'UPDATE usuarios SET password = ?, updated_by = ? WHERE id = ?',
      [newHash, req.userId, req.userId]
    );
    
    res.json({
      success: true,
      message: 'Contraseña actualizada correctamente'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al cambiar contraseña'
    });
  }
};

module.exports = {
  login,
  perfil,
  cambiarPassword
};

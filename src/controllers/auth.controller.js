const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { getPermisosUsuario } = require('../middlewares/permisos');

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Usuario y contraseña son requeridos'
      });
    }
    
    const [users] = await pool.query(
      `SELECT u.*, r.nombre as rol_nombre, eu.nombre as estado_nombre
       FROM usuarios u
       JOIN cat_roles r ON u.rol_id = r.id
       JOIN cat_estados_usuario eu ON u.estado_id = eu.id
       WHERE u.username = ? AND u.activo = 1`,
      [username]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }
    
    const user = users[0];
    
    if (user.estado_nombre !== 'Activo') {
      return res.status(401).json({
        success: false,
        message: 'Usuario inactivo o bloqueado'
      });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }
    
    // Actualizar último acceso
    await pool.query(
      'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?',
      [user.id]
    );
    
    // Generar token
    const token = jwt.sign(
      { userId: user.id, rol: user.rol_nombre },
      process.env.JWT_SECRETO,
      { expiresIn: '24h' }
    );
    
    // Obtener permisos del rol
    const permisos = getPermisosUsuario(user.rol_nombre);
    
    res.json({
      success: true,
      data: {
        token,
        usuario: {
          id: user.id,
          username: user.username,
          nombre_completo: user.nombre_completo,
          email: user.email,
          rol: user.rol_nombre,
          permisos
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
    const permisos = getPermisosUsuario(req.user.rol_nombre);
    
    res.json({
      success: true,
      data: {
        id: req.user.id,
        username: req.user.username,
        nombre_completo: req.user.nombre_completo,
        email: req.user.email,
        telefono: req.user.telefono,
        rol: req.user.rol_nombre,
        permisos
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
      'SELECT password_hash FROM usuarios WHERE id = ?',
      [req.userId]
    );
    
    const validPassword = await bcrypt.compare(password_actual, users[0].password_hash);
    
    if (!validPassword) {
      return res.status(400).json({
        success: false,
        message: 'Contraseña actual incorrecta'
      });
    }
    
    const newHash = await bcrypt.hash(password_nuevo, 10);
    
    await pool.query(
      'UPDATE usuarios SET password_hash = ?, updated_by = ? WHERE id = ?',
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

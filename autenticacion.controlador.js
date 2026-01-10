const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { obtenerPool } = require('../configuracion/base_datos');

const JWT_SECRET = process.env.JWT_SECRET || 'skynet_secreto_jwt_2024';

// LOGIN
async function login(req, res) {
  try {
    console.log('📥 Login request body:', req.body);
    
    const { usuario, contrasena, password } = req.body;
    const clave = contrasena || password;

    if (!usuario || !clave) {
      console.log('❌ Campos faltantes - usuario:', usuario, 'clave:', clave);
      return res.status(400).json({ ok: false, mensaje: 'Usuario y contraseña requeridos' });
    }

    const pool = obtenerPool();
    
    const [rows] = await pool.query(
      `SELECT id, usuario, nombre_completo, hash_contrasena, estado, rol_id 
       FROM usuarios 
       WHERE usuario = ? AND estado = 'activo'`,
      [usuario]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const passwordValido = await bcrypt.compare(clave, user.hash_contrasena);

    if (!passwordValido) {
      // Incrementar intentos fallidos
      await pool.query(
        'UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?',
        [user.id]
      );
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    // Resetear intentos y actualizar último acceso
    await pool.query(
      'UPDATE usuarios SET intentos_fallidos = 0, ultimo_acceso = NOW() WHERE id = ?',
      [user.id]
    );

    // Obtener nombre del rol si existe
    let rolNombre = 'usuario';
    if (user.rol_id) {
      try {
        const [rolRows] = await pool.query('SELECT nombre FROM roles WHERE id = ?', [user.rol_id]);
        if (rolRows.length > 0) rolNombre = rolRows[0].nombre;
      } catch (e) {
        // Tabla roles no existe
      }
    }

    const token = jwt.sign(
      { 
        usuario_id: user.id, 
        usuario: user.usuario,
        nombre: user.nombre_completo,
        rol: rolNombre
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      ok: true,
      mensaje: 'Login exitoso',
      token,
      usuario: {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre_completo,
        rol: rolNombre
      }
    });

  } catch (err) {
    console.error('❌ Error login:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error en el servidor' });
  }
}

// VERIFICAR TOKEN
async function verificarToken(req, res) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ ok: false, mensaje: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    res.json({
      ok: true,
      usuario: {
        id: decoded.usuario_id,
        usuario: decoded.usuario,
        nombre: decoded.nombre,
        rol: decoded.rol
      }
    });
  } catch (err) {
    res.status(401).json({ ok: false, mensaje: 'Token inválido' });
  }
}

// MIDDLEWARE DE AUTENTICACIÓN
function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ ok: false, mensaje: 'Acceso denegado' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    res.status(401).json({ ok: false, mensaje: 'Token inválido' });
  }
}

module.exports = { login, verificarToken, authMiddleware };

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { obtenerPool } = require('../configuracion/base_datos');

const JWT_SECRET = process.env.JWT_SECRET || 'skynet_secreto_jwt_2024';

async function login(req, res) {
  try {
    console.log('📥 Body recibido:', JSON.stringify(req.body));
    
    const { usuario, contrasena, password } = req.body || {};
    const clave = contrasena || password;

    if (!usuario || !clave) {
      return res.status(400).json({ ok: false, mensaje: 'Usuario y contraseña requeridos', debug: req.body });
    }

    const pool = obtenerPool();
    const [rows] = await pool.query(
      `SELECT id, usuario, nombre_completo, hash_contrasena, estado, rol_id FROM usuarios WHERE usuario = ? AND estado = 'activo'`,
      [usuario]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const passwordValido = await bcrypt.compare(clave, user.hash_contrasena);

    if (!passwordValido) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    await pool.query('UPDATE usuarios SET intentos_fallidos = 0, ultimo_acceso = NOW() WHERE id = ?', [user.id]);

    let rolNombre = 'admin';
    try {
      const [rolRows] = await pool.query('SELECT nombre FROM roles WHERE id = ?', [user.rol_id]);
      if (rolRows.length > 0) rolNombre = rolRows[0].nombre;
    } catch (e) {}

    const token = jwt.sign({ usuario_id: user.id, usuario: user.usuario, nombre: user.nombre_completo, rol: rolNombre }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ ok: true, mensaje: 'Login exitoso', token, usuario: { id: user.id, usuario: user.usuario, nombre: user.nombre_completo, rol: rolNombre }});
  } catch (err) {
    console.error('❌ Error login:', err);
    res.status(500).json({ ok: false, mensaje: 'Error en el servidor', error: err.message });
  }
}

async function verificarToken(req, res) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ ok: false, mensaje: 'Token no proporcionado' });
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ ok: true, usuario: decoded });
  } catch (err) {
    res.status(401).json({ ok: false, mensaje: 'Token inválido' });
  }
}

function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ ok: false, mensaje: 'Acceso denegado' });
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ ok: false, mensaje: 'Token inválido' });
  }
}

module.exports = { login, verificarToken, authMiddleware };

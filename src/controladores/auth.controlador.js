const bcrypt = require('bcryptjs');
const { obtenerPool } = require('../configuracion/base_datos');

async function login(req, res) {
  try {
    console.log('📥 Body recibido:', JSON.stringify(req.body));
    const { usuario, contrasena } = req.body;

    if (!usuario || !contrasena) {
      return res.status(400).json({ ok: false, mensaje: 'Usuario y contraseña requeridos' });
    }

    const pool = obtenerPool();
    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE usuario = ? AND activo = 1',
      [usuario]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const passValida = await bcrypt.compare(contrasena, user.contrasena);

    if (!passValida) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    res.json({
      ok: true,
      mensaje: 'Login exitoso',
      usuario: {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre,
        rol: user.rol
      }
    });
  } catch (err) {
    console.error('❌ Error en login:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error en el servidor' });
  }
}

module.exports = { login };

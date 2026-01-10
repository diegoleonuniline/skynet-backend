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
      'SELECT * FROM usuarios WHERE usuario = ? AND estado = "activo"',
      [usuario]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const passValida = await bcrypt.compare(contrasena, user.hash_contrasena);

    if (!passValida) {
      // Incrementar intentos fallidos
      await pool.query(
        'UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?',
        [user.id]
      );
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    // Resetear intentos y actualizar ultimo_acceso
    await pool.query(
      'UPDATE usuarios SET intentos_fallidos = 0, ultimo_acceso = NOW() WHERE id = ?',
      [user.id]
    );

    res.json({
      ok: true,
      mensaje: 'Login exitoso',
      usuario: {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre_completo,
        correo: user.correo,
        rol_id: user.rol_id
      }
    });
  } catch (err) {
    console.error('❌ Error en login:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error en el servidor' });
  }
}

module.exports = { login };

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { obtenerPool } = require('../configuracion/base_datos');
const jwtCfg = require('../configuracion/jwt');

async function login(req, res) {
  try {
    const { usuario, contrasena } = req.body || {};

    if (!usuario || !contrasena) {
      return res.status(400).json({ ok: false, mensaje: 'Falta usuario o contraseña.' });
    }

    const pool = obtenerPool();

    // 1) Buscar usuario activo
    const [rows] = await pool.query(
      `SELECT u.id, u.usuario, u.hash_contrasena, u.estado, u.intentos_fallidos,
              r.clave AS rol_clave, r.nombre AS rol_nombre
       FROM usuarios u
       INNER JOIN catalogo_roles r ON r.id = u.rol_id
       WHERE u.usuario = ?
       LIMIT 1`,
      [usuario]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas.' });
    }

    const u = rows[0];

    if (u.estado !== 'activo') {
      return res.status(403).json({ ok: false, mensaje: `Usuario ${u.estado}.` });
    }

    // 2) Comparar contraseña
    const coincide = await bcrypt.compare(contrasena, u.hash_contrasena);
    if (!coincide) {
      // incrementa intentos (seguro y rápido)
      await pool.query(
        `UPDATE usuarios
         SET intentos_fallidos = intentos_fallidos + 1
         WHERE id = ?`,
        [u.id]
      );

      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas.' });
    }

    // 3) Login correcto: reset intentos + último acceso (en paralelo)
    await Promise.all([
      pool.query(`UPDATE usuarios SET intentos_fallidos = 0, ultimo_acceso = NOW() WHERE id = ?`, [u.id])
    ]);

    // 4) Generar token
    const token = jwt.sign(
      { usuario_id: u.id, usuario: u.usuario, rol: u.rol_clave },
      jwtCfg.secreto,
      { expiresIn: jwtCfg.expira }
    );

    return res.json({
      ok: true,
      mensaje: 'Inicio de sesión exitoso.',
      token,
      usuario: {
        id: u.id,
        usuario: u.usuario,
        rol: { clave: u.rol_clave, nombre: u.rol_nombre }
      }
    });
  } catch (err) {
    console.error('❌ Error login:', err?.message || err);
    return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' });
  }
}

module.exports = { login };

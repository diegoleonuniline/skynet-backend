const jwt = require('jsonwebtoken');
const jwtCfg = require('../configuracion/jwt');

function requiereAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, mensaje: 'Falta token.' });
    }

    const payload = jwt.verify(token, jwtCfg.secreto);
    req.usuario = payload;
    next();
  } catch {
    return res.status(401).json({ ok: false, mensaje: 'Token inválido o expirado.' });
  }
}

module.exports = { requiereAuth };

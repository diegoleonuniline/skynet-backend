const { obtenerPool } = require('../configuracion/base_datos');

// ========================================
// OBTENER PAGOS
// ========================================

async function obtenerPagos(req, res) {
  try {
    const { pagina = 1, limite = 10, cliente_id } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);
    const pool = obtenerPool();

    let whereClause = '1=1';
    const params = [];

    if (cliente_id) {
      whereClause += ` AND p.cliente_id = ?`;
      params.push(cliente_id);
    }

    const [rows] = await pool.query(
      `SELECT p.*, 
              c.nombre as cliente_nombre,
              c.apellido_paterno as cliente_apellido
       FROM pagos p
       LEFT JOIN clientes c ON c.id = p.cliente_id
       WHERE ${whereClause}
       ORDER BY p.fecha_pago DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limite), offset]
    );

    res.json({ ok: true, pagos: rows });
  } catch (err) {
    console.error('❌ Error obtenerPagos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener pagos' });
  }
}

// ========================================
// CREAR PAGO
// ========================================

async function crearPago(req, res) {
  try {
    const { cliente_id, tipo, monto, metodo_pago, referencia, notas } = req.body;

    if (!cliente_id || !monto) {
      return res.status(400).json({ ok: false, mensaje: 'Cliente y monto son requeridos' });
    }

    const pool = obtenerPool();
    const id = generarUUID();

    await pool.query(
      `INSERT INTO pagos (id, cliente_id, tipo, monto, metodo_pago, referencia, notas, recibido_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, cliente_id, tipo || 'mensualidad', monto, metodo_pago || 'efectivo', referencia || null, notas || null, req.usuario?.usuario_id || null]
    );

    res.json({ ok: true, mensaje: 'Pago registrado', pago: { id } });
  } catch (err) {
    console.error('❌ Error crearPago:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al registrar pago' });
  }
}

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  obtenerPagos,
  crearPago
};

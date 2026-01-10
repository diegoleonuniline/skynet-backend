const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// pagos: id, cliente_id, fecha_pago, monto_pagado, metodo_pago_id, banco_id, numero_recibo, quien_envia_pago, telefono_quien_envia
// pagos_detalle: id, pago_id, cargo_id, monto_aplicado

const listar = async (req, res) => {
  try {
    const { cliente_id, limit = 50 } = req.query;
    
    let query = `SELECT p.*, mp.nombre as tipo_pago, c.nombre as cliente_nombre, c.apellido_paterno
                 FROM pagos p
                 LEFT JOIN catalogo_metodos_pago mp ON p.metodo_pago_id = mp.id
                 LEFT JOIN clientes c ON p.cliente_id = c.id WHERE 1=1`;
    const params = [];
    
    if (cliente_id) { query += ` AND p.cliente_id = ?`; params.push(cliente_id); }
    query += ` ORDER BY p.fecha_pago DESC LIMIT ?`; params.push(parseInt(limit));
    
    const [pagos] = await pool.query(query, params);
    for (let p of pagos) {
      p.estado = 'Aplicado';
      p.monto_total = p.monto_pagado;
      p.cliente_nombre = `${p.cliente_nombre || ''} ${p.apellido_paterno || ''}`.trim();
    }
    res.json({ success: true, data: pagos });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const preview = async (req, res) => {
  try {
    const { cliente_id, monto_total } = req.body;
    if (!cliente_id || !monto_total) return res.status(400).json({ success: false, message: 'Cliente y monto requeridos' });
    
    const [cargos] = await pool.query(
      `SELECT c.* FROM cargos c JOIN servicios s ON c.servicio_id = s.id
       WHERE s.cliente_id = ? ORDER BY c.fecha_vencimiento ASC`, [cliente_id]
    );
    
    for (let c of cargos) {
      const [p] = await pool.query('SELECT COALESCE(SUM(monto_aplicado), 0) as t FROM pagos_detalle WHERE cargo_id = ?', [c.id]);
      c.saldo = parseFloat(c.monto) - parseFloat(p[0].t);
    }
    
    const pendientes = cargos.filter(c => c.saldo > 0);
    let restante = parseFloat(monto_total);
    const cubrir = [];
    
    for (const c of pendientes) {
      if (restante <= 0) break;
      const aplicar = Math.min(restante, c.saldo);
      cubrir.push({ cargo_id: c.id, concepto: 'Mensualidad', saldo_actual: c.saldo, monto_a_aplicar: aplicar });
      restante -= aplicar;
    }
    
    res.json({ success: true, data: { cargos_a_cubrir: cubrir, saldo_favor_resultante: restante > 0 ? restante : 0 } });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const crear = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { cliente_id, monto_total, tipo_pago_id, banco_id, quien_envia_pago, telefono_quien_envia } = req.body;
    if (!cliente_id || !monto_total || !tipo_pago_id) return res.status(400).json({ success: false, message: 'Datos requeridos' });
    
    // Generar recibo
    const [last] = await conn.query('SELECT numero_recibo FROM pagos ORDER BY created_at DESC LIMIT 1');
    let num = 1;
    if (last.length > 0 && last[0].numero_recibo) {
      const m = last[0].numero_recibo.match(/\d+/);
      if (m) num = parseInt(m[0]) + 1;
    }
    const numero_recibo = `REC-${String(num).padStart(6, '0')}`;
    const pagoId = uuidv4();
    
    await conn.query(
      `INSERT INTO pagos (id, cliente_id, fecha_pago, monto_pagado, metodo_pago_id, banco_id, numero_recibo, quien_envia_pago, telefono_quien_envia, created_by)
       VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)`,
      [pagoId, cliente_id, monto_total, tipo_pago_id, banco_id || null, numero_recibo, quien_envia_pago || null, telefono_quien_envia || null, req.userId]
    );
    
    // FIFO
    const [cargos] = await conn.query(
      `SELECT c.* FROM cargos c JOIN servicios s ON c.servicio_id = s.id
       WHERE s.cliente_id = ? ORDER BY c.fecha_vencimiento ASC`, [cliente_id]
    );
    
    for (let c of cargos) {
      const [p] = await conn.query('SELECT COALESCE(SUM(monto_aplicado), 0) as t FROM pagos_detalle WHERE cargo_id = ?', [c.id]);
      c.saldo = parseFloat(c.monto) - parseFloat(p[0].t);
    }
    
    const pendientes = cargos.filter(c => c.saldo > 0);
    let restante = parseFloat(monto_total);
    
    for (const c of pendientes) {
      if (restante <= 0) break;
      const aplicar = Math.min(restante, c.saldo);
      
      await conn.query(`INSERT INTO pagos_detalle (id, pago_id, cargo_id, monto_aplicado) VALUES (?, ?, ?, ?)`, [uuidv4(), pagoId, c.id, aplicar]);
      
      const nuevoSaldo = c.saldo - aplicar;
      const estado = nuevoSaldo <= 0 ? 'Pagado' : 'Parcial';
      await conn.query(`UPDATE cargos SET estado_cargo = ?, updated_by = ? WHERE id = ?`, [estado, req.userId, c.id]);
      
      restante -= aplicar;
    }
    
    await conn.commit();
    res.status(201).json({ success: true, message: 'Pago registrado', data: { id: pagoId, numero_recibo } });
  } catch (error) {
    await conn.rollback();
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  } finally {
    conn.release();
  }
};

module.exports = { listar, preview, crear };

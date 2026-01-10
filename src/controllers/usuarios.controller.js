const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const listar = async (req, res) => {
  try {
    const [usuarios] = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.activo, u.created_at, r.nombre as rol_nombre
       FROM usuarios u
       LEFT JOIN usuarios_roles ur ON u.id = ur.usuario_id
       LEFT JOIN catalogo_roles r ON ur.rol_id = r.id
       WHERE u.activo = 1 ORDER BY u.created_at DESC`
    );
    
    res.json({
      success: true,
      data: usuarios.map(u => ({
        ...u, username: u.email, nombre_completo: u.nombre, estado_nombre: u.activo ? 'Activo' : 'Inactivo'
      }))
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const crear = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { nombre_completo, email, password, rol_id } = req.body;
    
    if (!nombre_completo || !email || !password) return res.status(400).json({ success: false, message: 'Datos requeridos' });
    
    const [existe] = await conn.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length > 0) return res.status(400).json({ success: false, message: 'Email ya existe' });
    
    const userId = uuidv4();
    const hash = await bcrypt.hash(password, 10);
    
    await conn.query(`INSERT INTO usuarios (id, nombre, email, password, activo, created_by) VALUES (?, ?, ?, ?, 1, ?)`,
      [userId, nombre_completo, email, hash, req.userId]);
    
    if (rol_id) {
      await conn.query(`INSERT INTO usuarios_roles (id, usuario_id, rol_id) VALUES (?, ?, ?)`, [uuidv4(), userId, rol_id]);
    }
    
    await conn.commit();
    res.status(201).json({ success: true, data: { id: userId } });
  } catch (error) {
    await conn.rollback();
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  } finally {
    conn.release();
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_completo, email, rol_id, activo } = req.body;
    
    const u = [], v = [];
    if (nombre_completo) { u.push('nombre = ?'); v.push(nombre_completo); }
    if (email) { u.push('email = ?'); v.push(email); }
    if (activo !== undefined) { u.push('activo = ?'); v.push(activo); }
    
    if (u.length > 0) {
      u.push('updated_by = ?'); v.push(req.userId); v.push(id);
      await pool.query(`UPDATE usuarios SET ${u.join(', ')} WHERE id = ?`, v);
    }
    
    if (rol_id) {
      await pool.query('DELETE FROM usuarios_roles WHERE usuario_id = ?', [id]);
      await pool.query('INSERT INTO usuarios_roles (id, usuario_id, rol_id) VALUES (?, ?, ?)', [uuidv4(), id, rol_id]);
    }
    
    res.json({ success: true, message: 'Actualizado' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password_nuevo } = req.body;
    if (!password_nuevo || password_nuevo.length < 6) return res.status(400).json({ success: false, message: 'Contraseña inválida' });
    
    const hash = await bcrypt.hash(password_nuevo, 10);
    await pool.query('UPDATE usuarios SET password = ?, updated_by = ? WHERE id = ?', [hash, req.userId, id]);
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

module.exports = { listar, crear, actualizar, resetPassword };

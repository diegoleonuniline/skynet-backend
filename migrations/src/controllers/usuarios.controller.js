const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const listar = async (req, res) => {
  try {
    const [usuarios] = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.activo, u.created_at,
              r.nombre as rol_nombre
       FROM usuarios u
       LEFT JOIN usuarios_roles ur ON u.id = ur.usuario_id
       LEFT JOIN catalogo_roles r ON ur.rol_id = r.id
       WHERE u.activo = 1
       ORDER BY u.created_at DESC`
    );
    
    res.json({
      success: true,
      data: usuarios.map(u => ({
        ...u,
        username: u.email,
        nombre_completo: u.nombre,
        estado_nombre: u.activo ? 'Activo' : 'Inactivo'
      }))
    });
  } catch (error) {
    console.error('Error listando usuarios:', error);
    res.status(500).json({ success: false, message: 'Error al listar usuarios' });
  }
};

const crear = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { nombre_completo, email, password, rol_id } = req.body;
    
    if (!nombre_completo || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nombre, email y contraseña son requeridos' });
    }
    
    // Verificar email único
    const [existe] = await connection.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length > 0) {
      return res.status(400).json({ success: false, message: 'El email ya está registrado' });
    }
    
    const userId = uuidv4();
    const hash = await bcrypt.hash(password, 10);
    
    await connection.query(
      `INSERT INTO usuarios (id, nombre, email, password, activo, created_by)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [userId, nombre_completo, email, hash, req.userId]
    );
    
    // Asignar rol
    if (rol_id) {
      await connection.query(
        `INSERT INTO usuarios_roles (id, usuario_id, rol_id) VALUES (?, ?, ?)`,
        [uuidv4(), userId, rol_id]
      );
    }
    
    await connection.commit();
    
    res.status(201).json({ success: true, message: 'Usuario creado', data: { id: userId } });
  } catch (error) {
    await connection.rollback();
    console.error('Error creando usuario:', error);
    res.status(500).json({ success: false, message: 'Error al crear usuario' });
  } finally {
    connection.release();
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_completo, email, rol_id, activo } = req.body;
    
    const updates = [];
    const values = [];
    
    if (nombre_completo) { updates.push('nombre = ?'); values.push(nombre_completo); }
    if (email) { updates.push('email = ?'); values.push(email); }
    if (activo !== undefined) { updates.push('activo = ?'); values.push(activo); }
    
    if (updates.length > 0) {
      updates.push('updated_by = ?');
      values.push(req.userId);
      values.push(id);
      
      await pool.query(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    
    // Actualizar rol si se proporciona
    if (rol_id) {
      await pool.query('DELETE FROM usuarios_roles WHERE usuario_id = ?', [id]);
      await pool.query(
        'INSERT INTO usuarios_roles (id, usuario_id, rol_id) VALUES (?, ?, ?)',
        [uuidv4(), id, rol_id]
      );
    }
    
    res.json({ success: true, message: 'Usuario actualizado' });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar usuario' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password_nuevo } = req.body;
    
    if (!password_nuevo || password_nuevo.length < 6) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    
    const hash = await bcrypt.hash(password_nuevo, 10);
    
    await pool.query(
      'UPDATE usuarios SET password = ?, updated_by = ? WHERE id = ?',
      [hash, req.userId, id]
    );
    
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al actualizar contraseña' });
  }
};

module.exports = { listar, crear, actualizar, resetPassword };

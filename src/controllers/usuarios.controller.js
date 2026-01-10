const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { registrarCreacion, registrarEdicion, registrarEliminacion } = require('../services/historial.service');

// Listar usuarios
const listar = async (req, res) => {
  try {
    const { rol_id, estado_id, busqueda, page = 1, limit = 20 } = req.query;
    
    let query = `
      SELECT u.id, u.username, u.nombre_completo, u.email, u.telefono,
             u.ultimo_acceso, u.activo, u.created_at,
             r.nombre as rol,
             e.nombre as estado
      FROM usuarios u
      JOIN cat_roles r ON u.rol_id = r.id
      JOIN cat_estados_usuario e ON u.estado_id = e.id
      WHERE u.activo = 1
    `;
    
    const params = [];
    
    if (rol_id) {
      query += ` AND u.rol_id = ?`;
      params.push(rol_id);
    }
    
    if (estado_id) {
      query += ` AND u.estado_id = ?`;
      params.push(estado_id);
    }
    
    if (busqueda) {
      query += ` AND (u.nombre_completo LIKE ? OR u.username LIKE ? OR u.email LIKE ?)`;
      const term = `%${busqueda}%`;
      params.push(term, term, term);
    }
    
    const offset = (page - 1) * limit;
    query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [usuarios] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: usuarios
    });
    
  } catch (error) {
    console.error('Error listando usuarios:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar usuarios'
    });
  }
};

// Obtener usuario por ID
const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [usuarios] = await pool.query(
      `SELECT u.id, u.username, u.nombre_completo, u.email, u.telefono,
              u.rol_id, u.estado_id, u.ultimo_acceso, u.activo, u.created_at,
              r.nombre as rol,
              e.nombre as estado
       FROM usuarios u
       JOIN cat_roles r ON u.rol_id = r.id
       JOIN cat_estados_usuario e ON u.estado_id = e.id
       WHERE u.id = ? AND u.activo = 1`,
      [id]
    );
    
    if (usuarios.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    res.json({
      success: true,
      data: usuarios[0]
    });
    
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuario'
    });
  }
};

// Crear usuario
const crear = async (req, res) => {
  try {
    const {
      username,
      password,
      nombre_completo,
      email,
      telefono,
      rol_id
    } = req.body;
    
    if (!username || !password || !nombre_completo || !rol_id) {
      return res.status(400).json({
        success: false,
        message: 'Username, password, nombre y rol son requeridos'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }
    
    // Verificar username único
    const [existente] = await pool.query(
      'SELECT id FROM usuarios WHERE username = ?',
      [username]
    );
    
    if (existente.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de usuario ya existe'
      });
    }
    
    // Obtener estado activo
    const [estados] = await pool.query(
      'SELECT id FROM cat_estados_usuario WHERE nombre = "Activo"'
    );
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const [result] = await pool.query(
      `INSERT INTO usuarios 
       (username, password_hash, nombre_completo, email, telefono, rol_id, estado_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, passwordHash, nombre_completo, email, telefono, rol_id, estados[0].id, req.userId]
    );
    
    await registrarCreacion('usuarios', result.insertId, req.userId, req.ip);
    
    res.status(201).json({
      success: true,
      message: 'Usuario creado correctamente',
      data: {
        id: result.insertId
      }
    });
    
  } catch (error) {
    console.error('Error creando usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear usuario'
    });
  }
};

// Actualizar usuario
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    
    const [actual] = await pool.query(
      'SELECT * FROM usuarios WHERE id = ? AND activo = 1',
      [id]
    );
    
    if (actual.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    const permitidos = ['nombre_completo', 'email', 'telefono', 'rol_id', 'estado_id'];
    const updates = [];
    const values = [];
    const cambios = {};
    
    for (const campo of permitidos) {
      if (campos[campo] !== undefined && campos[campo] !== actual[0][campo]) {
        updates.push(`${campo} = ?`);
        values.push(campos[campo]);
        cambios[campo] = {
          anterior: actual[0][campo],
          nuevo: campos[campo]
        };
      }
    }
    
    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'No hay cambios que guardar'
      });
    }
    
    updates.push('updated_by = ?');
    values.push(req.userId);
    values.push(id);
    
    await pool.query(
      `UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    await registrarEdicion('usuarios', id, cambios, req.userId, req.ip);
    
    res.json({
      success: true,
      message: 'Usuario actualizado correctamente'
    });
    
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar usuario'
    });
  }
};

// Resetear contraseña
const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { nueva_password } = req.body;
    
    if (!nueva_password || nueva_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }
    
    const passwordHash = await bcrypt.hash(nueva_password, 10);
    
    await pool.query(
      'UPDATE usuarios SET password_hash = ?, updated_by = ? WHERE id = ?',
      [passwordHash, req.userId, id]
    );
    
    res.json({
      success: true,
      message: 'Contraseña actualizada correctamente'
    });
    
  } catch (error) {
    console.error('Error reseteando password:', error);
    res.status(500).json({
      success: false,
      message: 'Error al resetear contraseña'
    });
  }
};

// Eliminar usuario (borrado lógico)
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    
    // No permitir eliminarse a sí mismo
    if (parseInt(id) === req.userId) {
      return res.status(400).json({
        success: false,
        message: 'No puedes eliminarte a ti mismo'
      });
    }
    
    await pool.query(
      'UPDATE usuarios SET activo = 0, updated_by = ? WHERE id = ?',
      [req.userId, id]
    );
    
    await registrarEliminacion('usuarios', id, req.userId, req.ip);
    
    res.json({
      success: true,
      message: 'Usuario eliminado correctamente'
    });
    
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar usuario'
    });
  }
};

// Obtener técnicos (para asignar instalaciones)
const tecnicos = async (req, res) => {
  try {
    const [tecnicos] = await pool.query(
      `SELECT u.id, u.nombre_completo, u.telefono
       FROM usuarios u
       JOIN cat_roles r ON u.rol_id = r.id
       JOIN cat_estados_usuario e ON u.estado_id = e.id
       WHERE (r.nombre = 'Tecnico' OR r.nombre = 'Administrador')
         AND e.nombre = 'Activo' AND u.activo = 1
       ORDER BY u.nombre_completo`
    );
    
    res.json({
      success: true,
      data: tecnicos
    });
    
  } catch (error) {
    console.error('Error obteniendo técnicos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener técnicos'
    });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  resetPassword,
  eliminar,
  tecnicos
};

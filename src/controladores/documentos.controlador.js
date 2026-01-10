const cloudinary = require('cloudinary').v2;
const { obtenerPool } = require('../configuracion/base_datos');

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: 'dnodzj8fz',
  api_key: '359224572738431',
  api_secret: 'Xjto7geI0Vrd_h9vQeakhHtYLYA'
});

// Subir documento (INE, comprobantes, etc)
async function subirDocumento(req, res) {
  try {
    const { cliente_id, tipo, imagen } = req.body;
    
    if (!cliente_id || !tipo || !imagen) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan datos requeridos' });
    }

    // Validar tipo
    const tiposPermitidos = ['ine_frente', 'ine_reverso', 'comprobante', 'contrato'];
    if (!tiposPermitidos.includes(tipo)) {
      return res.status(400).json({ ok: false, mensaje: 'Tipo de documento no válido' });
    }

    // Subir a Cloudinary
    const resultado = await cloudinary.uploader.upload(imagen, {
      folder: `skynet/clientes/${cliente_id}`,
      public_id: `${tipo}_${Date.now()}`,
      resource_type: 'image',
      transformation: [
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    });

    // Guardar URL en base de datos
    const pool = obtenerPool();
    
    if (tipo === 'ine_frente' || tipo === 'ine_reverso') {
      await pool.query(
        `UPDATE clientes SET ${tipo} = ? WHERE id = ?`,
        [resultado.secure_url, cliente_id]
      );
    } else {
      // Para otros documentos, guardar en tabla de documentos
      const id = generarUUID();
      await pool.query(
        `INSERT INTO documentos (id, cliente_id, tipo, url, nombre, creado_en) VALUES (?, ?, ?, ?, ?, NOW())`,
        [id, cliente_id, tipo, resultado.secure_url, resultado.original_filename || tipo]
      );
    }

    res.json({ 
      ok: true, 
      mensaje: 'Documento subido correctamente',
      url: resultado.secure_url,
      public_id: resultado.public_id
    });

  } catch (err) {
    console.error('❌ Error subiendo documento:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al subir documento' });
  }
}

// Eliminar documento de Cloudinary
async function eliminarDocumento(req, res) {
  try {
    const { public_id, cliente_id, tipo } = req.body;
    
    if (!public_id) {
      return res.status(400).json({ ok: false, mensaje: 'public_id requerido' });
    }

    // Eliminar de Cloudinary
    await cloudinary.uploader.destroy(public_id);

    // Si es INE, limpiar campo en base de datos
    if (cliente_id && (tipo === 'ine_frente' || tipo === 'ine_reverso')) {
      const pool = obtenerPool();
      await pool.query(
        `UPDATE clientes SET ${tipo} = NULL WHERE id = ?`,
        [cliente_id]
      );
    }

    res.json({ ok: true, mensaje: 'Documento eliminado' });

  } catch (err) {
    console.error('❌ Error eliminando documento:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar documento' });
  }
}

// Obtener documentos de un cliente
async function obtenerDocumentos(req, res) {
  try {
    const { cliente_id } = req.params;
    
    const pool = obtenerPool();
    
    // Obtener INE del cliente
    const [clientes] = await pool.query(
      `SELECT ine_frente, ine_reverso FROM clientes WHERE id = ?`,
      [cliente_id]
    );
    
    // Obtener otros documentos
    const [documentos] = await pool.query(
      `SELECT * FROM documentos WHERE cliente_id = ? ORDER BY creado_en DESC`,
      [cliente_id]
    );

    res.json({
      ok: true,
      ine: clientes[0] || {},
      documentos: documentos || []
    });

  } catch (err) {
    console.error('❌ Error obteniendo documentos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener documentos' });
  }
}

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = { subirDocumento, eliminarDocumento, obtenerDocumentos };

const mysql = require('mysql2/promise');

let pool = null;

async function conectarDB() {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USUARIO || 'root',
      password: process.env.DB_CONTRASENA || '',
      database: process.env.DB_NOMBRE || 'skynet',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    
    // Probar conexión
    const connection = await pool.getConnection();
    console.log('✅ Conectado a MySQL');
    connection.release();
  } catch (err) {
    console.error('❌ Error conectando a MySQL:', err.message);
  }
}

function obtenerPool() {
  return pool;
}

module.exports = { conectarDB, obtenerPool };

const mysql = require('mysql2/promise');

let pool = null;

async function conectarDB() {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'skynet',
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

const mysql = require('mysql2/promise');

let pool;

function obtenerPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USUARIO,
    password: process.env.DB_CONTRASENA,
    database: process.env.DB_NOMBRE,

    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL || 10),
    queueLimit: 0,

    // Si tu hosting exige SSL, lo activamos aquí (por ahora lo dejamos apagado)
    // ssl: { rejectUnauthorized: true }
  });

  return pool;
}

module.exports = { obtenerPool };

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: '-06:00'
});

pool.getConnection()
    .then(conn => {
        console.log('✅ MySQL conectado');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Error MySQL:', err.message);
    });

module.exports = pool;

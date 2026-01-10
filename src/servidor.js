require('dotenv').config();
const app = require('./app');
const { conectarDB } = require('./configuracion/base_datos');

const PORT = process.env.PORT || 3000;

// Conectar a la base de datos
conectarDB();

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ API Skynet activa en puerto ${PORT}`);
});

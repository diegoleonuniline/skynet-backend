require('dotenv').config();
const app = require('./app');
const { conectarDB } = require('./configuracion/base_datos');

const PORT = process.env.PORT || 3000;

conectarDB();

app.listen(PORT, () => {
  console.log(`✅ API Skynet activa en puerto ${PORT}`);
});

require('dotenv').config();
const { initializeDatabase } = require('../src/db');

initializeDatabase();
console.log('Banco de dados inicializado com sessões fictícias para demonstração.');

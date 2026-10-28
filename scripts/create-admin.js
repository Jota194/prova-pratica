require('dotenv').config();
const { db, initDb } = require('../src/db');
const bcrypt = require('bcryptjs');

const username = (process.env.ADMIN_USERNAME || '').trim();
const password = (process.env.ADMIN_PASSWORD || '').trim();

if (!username || !password) {
  console.error('Defina ADMIN_USERNAME e ADMIN_PASSWORD no arquivo .env antes de criar o administrador.');
  process.exit(1);
}

initDb();
const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
if (existing) {
  console.log(`Usuário administrativo "${username}" já existe.`);
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(password, 10);
db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, 'admin');
console.log(`Administrador criado com sucesso: ${username}`);

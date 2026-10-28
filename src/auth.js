const bcrypt = require('bcryptjs');
const { db } = require('./db');

function ensureAdminUser() {
  const username = process.env.ADMIN_USERNAME || '';
  const password = process.env.ADMIN_PASSWORD || '';

  if (!username || !password) {
    return { created: false, reason: 'ADMIN_USERNAME/ADMIN_PASSWORD não configurados.' };
  }

  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (existing) {
    return { created: false, reason: 'Usuário administrativo já existe.' };
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, 'admin');

  return { created: true, username };
}

function authenticateUser(username, password) {
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user) {
    return null;
  }

  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    return null;
  }

  return { id: user.id, username: user.username, role: user.role };
}

module.exports = {
  ensureAdminUser,
  authenticateUser,
};

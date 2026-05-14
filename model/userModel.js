const db = require('../config/db');
const bcrypt = require('bcrypt');

const UserModel = {
async getByEmail(email) {
  const allUsers = await db.query('SELECT email FROM users');

  const { rows } = await db.query(
    'SELECT * FROM users WHERE email = $1', [email]
  );
  return rows[0];
},

  async getAll() {
    const { rows } = await db.query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    return rows;
  },

  async create({ name, email, password, role }) {
    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at`,
      [name, email, password_hash, role || 'staff']
    );
    return rows[0];
  },

  async verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
  },

  async delete(id) {
    await db.query('DELETE FROM users WHERE id = $1', [id]);
  },
};

module.exports = UserModel;
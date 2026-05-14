const db = require('../config/db');

const ClientModel = {
  async getAll() {
    const { rows } = await db.query(
      'SELECT * FROM clients ORDER BY created_at DESC'
    );
    return rows;
  },

  async getById(id) {
    const { rows } = await db.query(
      'SELECT * FROM clients WHERE id = $1', [id]
    );
    return rows[0];
  },

  async search(term) {
    const { rows } = await db.query(
      `SELECT * FROM clients
       WHERE full_name ILIKE $1 OR phone ILIKE $1 OR nationality ILIKE $1
       ORDER BY full_name`,
      [`%${term}%`]
    );
    return rows;
  },

  async create({ full_name, phone, nationality, notes }) {
    const { rows } = await db.query(
      `INSERT INTO clients (full_name, phone, nationality, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [full_name, phone, nationality, notes]
    );
    return rows[0];
  },

  async update(id, { full_name, phone, nationality, notes }) {
    const { rows } = await db.query(
      `UPDATE clients SET full_name=$1, phone=$2, nationality=$3, notes=$4
       WHERE id=$5 RETURNING *`,
      [full_name, phone, nationality, notes, id]
    );
    return rows[0];
  },

  async delete(id) {
    await db.query('DELETE FROM clients WHERE id = $1', [id]);
  },
};

module.exports = ClientModel;
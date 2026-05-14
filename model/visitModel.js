const db = require('../config/db');

const VisitModel = {
  async getByClient(client_id) {
    const { rows } = await db.query(
      `SELECT * FROM visits WHERE client_id = $1 ORDER BY check_in DESC`,
      [client_id]
    );
    return rows;
  },

  async getById(id) {
    const { rows } = await db.query(
      'SELECT * FROM visits WHERE id = $1', [id]
    );
    return rows[0];
  },

async getActive() {
  const { rows } = await db.query(
    `SELECT v.*, c.full_name AS client_name, c.phone
     FROM visits v
     JOIN clients c ON c.id = v.client_id
     ORDER BY v.created_at DESC`  
  );
  return rows;
},
  async create({ client_id, reason, notes }) {
    const { rows } = await db.query(
      `INSERT INTO visits (client_id, reason, notes, status, created_at)
      VALUES ($1, $2, $3, 'active', NOW()) RETURNING *`,
      [client_id, reason, notes || null]
    );
    return rows[0];
  },

  async complete(id) {
  const { rows } = await db.query(
    `UPDATE visits SET status = 'completed', completed_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0];
},

  async update(id, { check_in, check_out, status }) {
    const { rows } = await db.query(
      `UPDATE visits SET check_in=$1, check_out=$2, status=$3
       WHERE id=$4 RETURNING *`,
      [check_in, check_out, status, id]
    );
    return rows[0];
  },

  async delete(id) {
    await db.query('DELETE FROM visits WHERE id = $1', [id]);
  },
};

module.exports = VisitModel;
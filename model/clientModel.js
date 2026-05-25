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

 async create({ full_name, phone, email, nationality, notes }) {
  const { rows } = await db.query(
    `INSERT INTO clients (full_name, phone, email, nationality, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [full_name, phone, email || null, nationality || null, notes || null]
  );
  return rows[0];
},

  async update(id, { full_name, phone, email, nationality, notes }) {
    const { rows } = await db.query(
      `UPDATE clients SET full_name=$1, phone=$2, email=$3, nationality=$4, notes=$5
       WHERE id=$6 RETURNING *`,
      [full_name, phone, email || null, nationality || null, notes || null, id]
    );
    return rows[0];
  },

  async delete(id) {
    await db.query('DELETE FROM clients WHERE id = $1', [id]);
  },

  async getProfile(id) {
  const { rows: clientRows } = await db.query(
    `SELECT * FROM clients WHERE id = $1`, [id]
  );
  if (!clientRows.length) return null;

  const { rows: visits } = await db.query(
    `SELECT * FROM visits WHERE client_id = $1 ORDER BY created_at DESC`, [id]
  );

  const { rows: invoices } = await db.query(
    `SELECT * FROM invoices WHERE client_id = $1 ORDER BY created_at DESC`, [id]
  );

  const { rows: payments } = await db.query(
    `SELECT p.*, i.invoice_number
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     WHERE i.client_id = $1
     ORDER BY p.created_at DESC`, [id]
  );

  const total_visits   = visits.length;
  const total_invoiced = invoices.reduce((s, i) => s + parseFloat(i.total_amount || 0), 0);
  const total_paid     = payments.reduce((s, p) => s + parseFloat(p.amount_paid || 0), 0);
  const balance        = total_invoiced - total_paid;

  return {
    client:   clientRows[0],
    stats:    { total_visits, total_invoiced, total_paid, balance },
    visits,
    invoices,
    payments,
  };
},
};

module.exports = ClientModel;
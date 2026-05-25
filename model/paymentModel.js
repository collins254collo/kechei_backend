const db = require('../config/db');

const PaymentModel = {
  async getByInvoice(invoice_id) {
    const { rows } = await db.query(
      `SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC`,
      [invoice_id]
    );
    return rows;
  },

  async getTotalPaid(invoice_id) {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total FROM payments WHERE invoice_id = $1`,
      [invoice_id]
    );
    return parseFloat(rows[0].total);
  },

  async create({ invoice_id, amount_paid, method, payment_date, notes }) {
    const { rows } = await db.query(
      `INSERT INTO payments (invoice_id, amount_paid, method, payment_date, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [invoice_id, amount_paid, method, payment_date, notes]
    );
    return rows[0];
  },

  async delete(id) {
    await db.query('DELETE FROM payments WHERE id = $1', [id]);
  },

  async getAll() {
  const { rows } = await db.query(
    `SELECT p.*, i.invoice_number, c.full_name AS client_full_name
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN clients c  ON c.id = i.client_id
     ORDER BY p.payment_date DESC, p.created_at DESC`
  );
  return rows;
},

};

module.exports = PaymentModel;
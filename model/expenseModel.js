const db = require('../config/db');

const ExpenseModel = {
  async getByVisit(visit_id) {
    const { rows } = await db.query(
      `SELECT * FROM expenses WHERE visit_id = $1 ORDER BY expense_date DESC`,
      [visit_id]
    );
    return rows;
  },

  // line items for a specific invoice, in date order — feeds the invoice template
  async getByInvoice(invoice_id) {
    const { rows } = await db.query(
      `SELECT e.*, e.notes AS description
       FROM expenses e
       WHERE e.invoice_id = $1
       ORDER BY e.expense_date ASC`,
      [invoice_id]
    );
    return rows;
  },

  async getTotalByVisit(visit_id) {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE visit_id = $1`,
      [visit_id]
    );
    return parseFloat(rows[0].total);
  },

  // only expenses for this visit not yet attached to an invoice
  async getUnbilledByVisit(visit_id) {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE visit_id = $1 AND invoice_id IS NULL`,
      [visit_id]
    );
    return parseFloat(rows[0].total);
  },

  //  unbilled expenses across every visit belonging to this client
  async getUnbilledByClient(client_id) {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(e.amount), 0) AS total
       FROM expenses e
       JOIN visits v ON v.id = e.visit_id
       WHERE v.client_id = $1 AND e.invoice_id IS NULL`,
      [client_id]
    );
    return parseFloat(rows[0].total);
  },

  //  stamp invoice_id on all unbilled expenses for a visit. Runs inside a transaction,
  async markInvoicedByVisit(dbClient, visit_id, invoice_id) {
    await dbClient.query(
      `UPDATE expenses SET invoice_id = $1
       WHERE visit_id = $2 AND invoice_id IS NULL`,
      [invoice_id, visit_id]
    );
  },

  //  same, but across every visit for a client
  async markInvoicedByClient(dbClient, client_id, invoice_id) {
    await dbClient.query(
      `UPDATE expenses e SET invoice_id = $1
       FROM visits v
       WHERE e.visit_id = v.id AND v.client_id = $2 AND e.invoice_id IS NULL`,
      [invoice_id, client_id]
    );
  },

  async create({ visit_id, category, amount, expense_date, description }) {
    const { rows } = await db.query(
      `INSERT INTO expenses (visit_id, category, amount, expense_date, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [visit_id, category, amount, expense_date, description]
    );
    return rows[0];
  },

  async update(id, { category, amount, expense_date, description }) {
    const { rows } = await db.query(
      `UPDATE expenses SET category=$1, amount=$2, expense_date=$3, notes=$4
       WHERE id=$5 RETURNING *`,
      [category, amount, expense_date, description, id]
    );
    return rows[0];
  },

  async delete(id) {
    await db.query('DELETE FROM expenses WHERE id = $1', [id]);
  },

  async getAll() {
    const { rows } = await db.query(
      `SELECT e.*, e.notes AS description, c.full_name AS visit_full_name
       FROM expenses e
       LEFT JOIN visits v ON v.id = e.visit_id
       LEFT JOIN clients c ON c.id = v.client_id
       ORDER BY e.expense_date DESC`
    );
    return rows;
  },
};

module.exports = ExpenseModel;
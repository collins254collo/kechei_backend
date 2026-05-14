const db = require('../config/db');

const InvoiceModel = {
  async getByVisit(visit_id) {
    const { rows } = await db.query(
      'SELECT * FROM invoices WHERE visit_id = $1', [visit_id]
    );
    return rows[0];
  },

  async getById(id) {
    const { rows } = await db.query(
      `SELECT i.*, c.full_name, c.phone, c.nationality
       FROM invoices i
       JOIN visits v ON v.id = i.visit_id
       JOIN clients c ON c.id = v.client_id
       WHERE i.id = $1`,
      [id]
    );
    return rows[0];
  },

  async getAll() {
    const { rows } = await db.query(
      `SELECT i.*, c.full_name FROM invoices i
       JOIN visits v ON v.id = i.visit_id
       JOIN clients c ON c.id = v.client_id
       ORDER BY i.issued_date DESC`
    );
    return rows;
  },

  // Generate next invoice number: INV-2025-001
  async generateNumber() {
    const year = new Date().getFullYear();
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM invoices WHERE invoice_number LIKE $1`,
      [`INV-${year}-%`]
    );
    const seq = String(parseInt(rows[0].count) + 1).padStart(3, '0');
    return `INV-${year}-${seq}`;
  },

  async create({ visit_id, total_expenses, total_amount }) {
    const invoice_number = await this.generateNumber();
    const { rows } = await db.query(
      `INSERT INTO invoices (visit_id, invoice_number, total_expenses, total_amount, status, issued_date)
       VALUES ($1, $2, $3, $4, 'unpaid', CURRENT_DATE) RETURNING *`,
      [visit_id, invoice_number, total_expenses, total_amount]
    );
    return rows[0];
  },

  // Recalculate status based on payments
  async updateStatus(id) {
    const { rows: inv } = await db.query(
      'SELECT total_amount FROM invoices WHERE id = $1', [id]
    );
    const { rows: pay } = await db.query(
      'SELECT COALESCE(SUM(amount_paid), 0) AS paid FROM payments WHERE invoice_id = $1', [id]
    );

    const total = parseFloat(inv[0].total_amount);
    const paid = parseFloat(pay[0].paid);

    let status = 'unpaid';
    if (paid >= total) status = 'paid';
    else if (paid > 0) status = 'partial';

    const { rows } = await db.query(
      'UPDATE invoices SET status=$1 WHERE id=$2 RETURNING *',
      [status, id]
    );
    return rows[0];
  },

  async delete(id) {
    await db.query('DELETE FROM invoices WHERE id = $1', [id]);
  },
};

module.exports = InvoiceModel;
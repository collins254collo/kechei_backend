const db = require('../config/db');

const ExpenseModel = {
  async getByVisit(visit_id) {
    const { rows } = await db.query(
      `SELECT * FROM expenses WHERE visit_id = $1 ORDER BY expense_date DESC`,
      [visit_id]
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
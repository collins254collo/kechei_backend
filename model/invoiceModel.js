const db = require('../config/db');

const VAT_RATE = 0.16;
const TOURISM_LEVY_RATE = 0.02;
const TOTAL_MULTIPLIER = 1 + VAT_RATE + TOURISM_LEVY_RATE; // 1.18 — keep in sync with invoiceTemplate.js

const InvoiceModel = {

  async getAll() {
    const { rows } = await db.query(
      `SELECT 
         i.id,
         i.invoice_number,
         i.client_id,
         i.visit_id,
         i.group_id,
         i.total_services,
         i.total_expenses,
         i.total_amount,
         i.final_amount,
         i.paid_amount,
         i.description,
         i.status,
         i.issued_date,
         i.due_date,
         i.notes,
         i.created_at,
         i.updated_at,
         COALESCE(c.full_name, vc.full_name) AS full_name
       FROM invoices i
       LEFT JOIN clients c  ON c.id = i.client_id
       LEFT JOIN visits v   ON v.id = i.visit_id
       LEFT JOIN clients vc ON vc.id = v.client_id
       ORDER BY i.created_at DESC`
    );
    return rows;
  },

  async getById(id) {
    const { rows } = await db.query(
      `SELECT 
         i.*,
         COALESCE(c.full_name, vc.full_name)   AS full_name,
         COALESCE(c.phone,     vc.phone)        AS phone,
         COALESCE(c.email,     vc.email)        AS email
       FROM invoices i
       LEFT JOIN clients c  ON c.id = i.client_id
       LEFT JOIN visits v   ON v.id = i.visit_id
       LEFT JOIN clients vc ON vc.id = v.client_id
       WHERE i.id = $1`,
      [id]
    );
    return rows[0];
  },

  async getByVisit(visit_id) {
    const { rows } = await db.query(
      `SELECT * FROM invoices WHERE visit_id = $1`,
      [visit_id]
    );
    return rows[0];
  },

  // Dedup check for group billing — mirrors getByVisit.
  async getByGroup(group_id) {
    const { rows } = await db.query(
      `SELECT * FROM invoices WHERE group_id = $1`,
      [group_id]
    );
    return rows[0];
  },

  async generateNumber(queryable = db) {
    const { rows } = await queryable.query(`SELECT nextval('invoice_number_seq') AS seq`);
    const year = new Date().getFullYear();
    const seq  = String(rows[0].seq).padStart(4, '0');
    return `INV-${year}-${seq}`;
  },

  // on a separate pool connection.
    async create({ client_id, visit_id, group_id, total_services = 0, total_expenses = 0, total_amount, final_amount, description, issued_date, due_date,   notes }, queryable = db) {
      const invoice_number = await this.generateNumber(queryable);

      const subtotal = total_amount ?? (Number(total_services) + Number(total_expenses));

      // Grand total = subtotal + VAT (16%) + Tourism Levy (2%), matching invoiceTemplate.js
      const computedFinal = subtotal * TOTAL_MULTIPLIER;

      const { rows } = await queryable.query(
        `INSERT INTO invoices
          (invoice_number, client_id, visit_id, group_id, total_services, total_expenses,
            total_amount, final_amount, description, status, issued_date, due_date, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'unpaid',$10,$11,$12)
        RETURNING *`,
        [
          invoice_number,
          client_id   ?? null,
          visit_id    ?? null,
          group_id    ?? null,
          total_services,
          total_expenses,
          subtotal,
          final_amount ?? computedFinal,
          description  ?? null,
          issued_date   || new Date().toISOString().split('T')[0],
          due_date      || null,
          notes         || null,
        ]
      );
      return rows[0];
    },

  async update(id, { status, total_amount, final_amount, paid_amount, due_date, notes }) {
    let resolvedFinal = final_amount ?? null;

    if (total_amount != null && final_amount == null) {
      // Grand total = subtotal + VAT (16%) + Tourism Levy (2%), matching invoiceTemplate.js
      resolvedFinal = Number(total_amount) * TOTAL_MULTIPLIER;
    }

    const { rows } = await db.query(
      `UPDATE invoices SET
         status       = COALESCE($1, status),
         total_amount = COALESCE($2, total_amount),
         final_amount = COALESCE($3, final_amount),
         paid_amount  = COALESCE($4, paid_amount),
         due_date     = COALESCE($5, due_date),
         notes        = COALESCE($6, notes),
         updated_at   = now()
       WHERE id = $7
       RETURNING *`,
      [
        status       ?? null,
        total_amount ?? null,
        resolvedFinal,
        paid_amount  ?? null,
        due_date     ?? null,
        notes        ?? null,
        id,
      ]
    );
    return rows[0];
  },

  async updateStatus(id) {
    const { rows: inv } = await db.query(
      `SELECT final_amount FROM invoices WHERE id = $1`, [id]
    );
    const { rows: pay } = await db.query(
      `SELECT COALESCE(SUM(amount_paid), 0) AS paid FROM payments WHERE invoice_id = $1`, [id]
    );

    const total = parseFloat(inv[0].final_amount);
    const paid  = parseFloat(pay[0].paid);

    const status = paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

    const { rows } = await db.query(
      `UPDATE invoices SET status=$1, paid_amount=$2, updated_at=now()
       WHERE id=$3 RETURNING *`,
      [status, paid, id]
    );
    return rows[0];
  },

  async delete(id) {
    await db.query(`DELETE FROM invoices WHERE id = $1`, [id]);
  },
};

module.exports = InvoiceModel;
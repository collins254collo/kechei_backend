const db = require('../config/db');
const InvoiceModel   = require('../model/invoiceModel');
const ExpenseModel   = require('../model/expenseModel');
const PaymentModel   = require('../model/paymentModel');
const { buildInvoiceHtml } = require('../services/invoiceTemplate');
const { generatePdfFromHtml } = require('../services/pdfService');
const { sendInvoiceEmail } = require('../services/emailService');

const UPDATABLE_INVOICE_FIELDS = ['status', 'total_amount', 'due_date', 'notes'];

function pickUpdatableFields(body) {
  const out = {};
  for (const key of UPDATABLE_INVOICE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const invoiceController = {
  async getAll(req, res) {
    try {
      const invoices = await InvoiceModel.getAll();
      res.json(invoices);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
      try {
        const invoice = await InvoiceModel.getById(req.params.id);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        const expenses   = await ExpenseModel.getByInvoice(invoice.id);
        const payments    = await PaymentModel.getByInvoice(invoice.id);
        const total_paid  = await PaymentModel.getTotalPaid(invoice.id);
        const balance     = parseFloat(invoice.final_amount) - total_paid;

        res.json({
          ...invoice,
          expenses,
          payments: payments.slice().reverse(), 
          total_paid,
          balance,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

  async create(req, res) {
    try {
      const { client_id, visit_id, total_services, total_expenses,
              total_amount, final_amount, issued_date, due_date, notes } = req.body;

      if (!client_id && !visit_id) {
        return res.status(400).json({ error: 'client_id or visit_id is required' });
      }
     
      if (total_amount == null && final_amount == null) {
        return res.status(400).json({ error: 'total_amount is required' });
      }
      if (total_amount != null && Number.isNaN(Number(total_amount))) {
        return res.status(400).json({ error: 'total_amount must be a number' });
      }

      const invoice = await InvoiceModel.create({
        client_id, visit_id, total_services, total_expenses,
        total_amount, final_amount, issued_date, due_date, notes,
      });
      res.status(201).json(invoice);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Preview endpoint — lets the frontend show the unbilled total before the admin confirms
  async previewByClient(req, res) {
    try {
      const { client_id } = req.params;
      if (!client_id) return res.status(400).json({ error: 'client_id is required' });

      const total_expenses = await ExpenseModel.getUnbilledByClient(client_id);
      res.json({ client_id: Number(client_id), total_expenses });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async generateFromVisit(req, res) {
    const dbClient = await db.connect();
    try {
      const { visit_id, due_date, notes } = req.body;
      if (!visit_id) return res.status(400).json({ error: 'visit_id is required' });

      const existing = await InvoiceModel.getByVisit(visit_id);
      if (existing) {
        return res.status(409).json({
          error: 'Invoice already exists for this visit',
          invoice: existing,
        });
      }

      const { rows: visitRows } = await db.query(
        `SELECT v.client_id FROM visits v WHERE v.id = $1`,
        [visit_id]
      );
      if (!visitRows.length) return res.status(404).json({ error: 'Visit not found' });
      const client_id = visitRows[0].client_id;

      await dbClient.query('BEGIN');

           const { rows: lockedExpenseRows } = await dbClient.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
           FROM expenses
          WHERE visit_id = $1 AND invoice_id IS NULL
          FOR UPDATE`,
        [visit_id]
      );
      const total_expenses = parseFloat(lockedExpenseRows[0].total);

      if (total_expenses <= 0) {
        await dbClient.query('ROLLBACK');
        return res.status(400).json({ error: 'No unbilled expenses for this visit' });
      }

      const invoice = await InvoiceModel.create({
        client_id,
        visit_id,
        total_expenses,
        total_amount: total_expenses,
        due_date,
        notes,
      });

      await ExpenseModel.markInvoicedByVisit(dbClient, visit_id, invoice.id);

      await dbClient.query('COMMIT');
      res.status(201).json(invoice);
    } catch (err) {
      await dbClient.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      dbClient.release();
    }
  },

  //  generate an invoice covering every unbilled expense across all of a client's visits
  async generateFromClient(req, res) {
    const dbClient = await db.connect();
    try {
      const { client_id, due_date, notes } = req.body;
      if (!client_id) return res.status(400).json({ error: 'client_id is required' });

      await dbClient.query('BEGIN');
        const { rows: expenseRows } = await dbClient.query(
          `SELECT e.id, e.amount
            FROM expenses e
            JOIN visits v ON v.id = e.visit_id
            WHERE v.client_id = $1 AND e.invoice_id IS NULL
            FOR UPDATE OF e`,
          [client_id]
        );
        const total_expenses = expenseRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

        if (total_expenses <= 0) {
          await dbClient.query('ROLLBACK');
          return res.status(400).json({ error: 'No unbilled expenses for this client' });
        }

      const invoice = await InvoiceModel.create({
        client_id,
        total_expenses,
        total_amount: total_expenses, 
        due_date,
        notes,
      });

      await ExpenseModel.markInvoicedByClient(dbClient, client_id, invoice.id);

      await dbClient.query('COMMIT');
      res.status(201).json(invoice);
    } catch (err) {
      await dbClient.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      dbClient.release();
    }
  },

  // Manual invoice — admin enters the amount and description directly.
  // Either an existing client_id is supplied, or a brand-new client is
  // resolved (found by email, or created) from client_name/client_email/client_phone.
  async createManual(req, res) {
    const dbClient = await db.connect();
    try {
      const { client_id, client_name, client_email, client_phone,
              amount, description, due_date, notes } = req.body;

      const amountNum = Number(amount);
      if (amount == null || Number.isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }
      if (!description || !String(description).trim()) {
        return res.status(400).json({ error: 'description is required' });
      }
      if (!client_id && !(client_name && client_email)) {
        return res.status(400).json({ error: 'Provide client_id, or client_name and client_email' });
      }
      if (!client_id && client_email && !EMAIL_RE.test(String(client_email).trim())) {
        return res.status(400).json({ error: 'client_email is not a valid email address' });
      }

      await dbClient.query('BEGIN');

      let resolvedClientId = client_id || null;

      if (!resolvedClientId) {
        const { rows: existing } = await dbClient.query(
          `SELECT id FROM clients WHERE lower(email) = lower($1) LIMIT 1`,
          [client_email.trim()]
        );
        if (existing.length) {
          resolvedClientId = existing[0].id;
        } else {
          const { rows: created } = await dbClient.query(
            `INSERT INTO clients (full_name, email, phone) VALUES ($1, $2, $3) RETURNING id`,
            [client_name.trim(), client_email.trim(), client_phone ? String(client_phone).trim() : null]
          );
          resolvedClientId = created[0].id;
        }
      }

      const invoice = await InvoiceModel.create({
        client_id: resolvedClientId,
        total_amount: amountNum,
        description: String(description).trim(),
        due_date,
        notes,
      });

      await dbClient.query('COMMIT');
      res.status(201).json(invoice);
    } catch (err) {
      await dbClient.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      dbClient.release();
    }
  },

  async update(req, res) {
    try {
      
           const fields = pickUpdatableFields(req.body);

      if (fields.total_amount != null && Number.isNaN(Number(fields.total_amount))) {
        return res.status(400).json({ error: 'total_amount must be a number' });
      }

      const invoice = await InvoiceModel.update(req.params.id, fields);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      res.json(invoice);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  //previewing the pdf before sending 

 async previewPdf(req, res) {
    try {
      const invoice = await InvoiceModel.getById(req.params.id);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

      const expenses = await ExpenseModel.getByInvoice(invoice.id);
      const payments = await PaymentModel.getByInvoice(invoice.id);

      const html = buildInvoiceHtml({ ...invoice, expenses, payments: payments.slice().reverse() });
      const pdfBuffer = await generatePdfFromHtml(html);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error('previewPdf failed:', err);
      res.status(500).json({ error: err.message });
    }
  },

  // send invoice to client 
  async sendToClient(req, res) {
    try {
      const invoice = await InvoiceModel.getById(req.params.id);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      if (!invoice.email) {
        return res.status(400).json({ error: 'This client has no email on file' });
      }

      const expenses = await ExpenseModel.getByInvoice(invoice.id);
      const payments = await PaymentModel.getByInvoice(invoice.id);

      const html = buildInvoiceHtml({ ...invoice, expenses, payments: payments.slice().reverse() });
      const pdfBuffer = await generatePdfFromHtml(html);
      await sendInvoiceEmail({ to: invoice.email, invoice, pdfBuffer });

      res.json({ success: true, sentTo: invoice.email });
    } catch (err) {
      console.error('sendToClient failed:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      await InvoiceModel.delete(req.params.id);
      res.json({ message: 'Invoice deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = invoiceController;
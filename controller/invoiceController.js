const db = require('../config/db');
const InvoiceModel   = require('../model/invoiceModel');
const ExpenseModel   = require('../model/expenseModel');
const PaymentModel   = require('../model/paymentModel');
const { buildInvoiceHtml } = require('../services/invoiceTemplate');
const { generatePdfFromHtml } = require('../services/pdfService');
const { sendInvoiceEmail } = require('../services/emailService');

const UPDATABLE_INVOICE_FIELDS = ['status', 'total_amount', 'due_date', 'notes'];
const ALLOWED_CURRENCIES = ['KES', 'USD', 'EUR'];
const DEFAULT_CURRENCY = 'KES';

function pickUpdatableFields(body) {
  const out = {};
  for (const key of UPDATABLE_INVOICE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

// Groups locked expense rows ({ id, amount, currency }) by currency.
// Returns e.g. { KES: { total: 5000, ids: [1,2] }, USD: { total: 120, ids: [3] } }
function groupExpenseRowsByCurrency(rows) {
  return rows.reduce((acc, r) => {
    const cur = r.currency || DEFAULT_CURRENCY;
    if (!acc[cur]) acc[cur] = { total: 0, ids: [] };
    acc[cur].total += parseFloat(r.amount);
    acc[cur].ids.push(r.id);
    return acc;
  }, {});
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
      let { currency } = req.body;

      if (!client_id && !visit_id) {
        return res.status(400).json({ error: 'client_id or visit_id is required' });
      }
     
      if (total_amount == null && final_amount == null) {
        return res.status(400).json({ error: 'total_amount is required' });
      }
      if (total_amount != null && Number.isNaN(Number(total_amount))) {
        return res.status(400).json({ error: 'total_amount must be a number' });
      }

      currency = currency ? String(currency).toUpperCase() : DEFAULT_CURRENCY;
      if (!ALLOWED_CURRENCIES.includes(currency)) {
        return res.status(400).json({ error: `currency must be one of: ${ALLOWED_CURRENCIES.join(', ')}` });
      }

      const invoice = await InvoiceModel.create({
        client_id, visit_id, total_services, total_expenses,
        total_amount, final_amount, currency, issued_date, due_date, notes,
      });
      res.status(201).json(invoice);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Preview endpoint — lets the frontend show the unbilled total before the admin confirms.
  // FIX: ExpenseModel.getUnbilledByClient returns totals grouped by currency
  // (e.g. [{ currency: 'KES', total: 5000 }, { currency: 'USD', total: 120 }]),
  // not a single number — the response now reflects that shape instead of
  // pretending it's one figure.
  async previewByClient(req, res) {
    try {
      const { client_id } = req.params;
      if (!client_id) return res.status(400).json({ error: 'client_id is required' });

      const unbilled = await ExpenseModel.getUnbilledByClient(client_id);
      res.json({ client_id: Number(client_id), unbilled });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  //  generate an invoice covering every unbilled expense for a single visit.
  // FIX: previously did SUM(amount) ... FOR UPDATE, which Postgres rejects
  // (you can't combine an aggregate with FOR UPDATE), and ignored currency
  // entirely. Now locks individual rows, groups by currency, and creates
  // one invoice per currency present.
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

      const lockedRows = await ExpenseModel.getUnbilledByVisitForUpdate(dbClient, visit_id);
      const byCurrency = groupExpenseRowsByCurrency(lockedRows);
      const currencies = Object.keys(byCurrency);

      if (currencies.length === 0) {
        await dbClient.query('ROLLBACK');
        return res.status(400).json({ error: 'No unbilled expenses for this visit' });
      }

      const invoices = [];
      for (const currency of currencies) {
        const { total, ids } = byCurrency[currency];
        const invoice = await InvoiceModel.create({
          client_id,
          visit_id,
          total_expenses: total,
          total_amount: total,
          currency,
          due_date,
          notes,
        }, dbClient);
        await ExpenseModel.markInvoiced(dbClient, ids, invoice.id);
        invoices.push(invoice);
      }

      await dbClient.query('COMMIT');
      // Always return an array so the frontend has one shape to handle,
      // whether the visit produced one invoice or several currencies' worth.
      res.status(201).json({ invoices });
    } catch (err) {
      await dbClient.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      dbClient.release();
    }
  },

  //  generate an invoice covering every unbilled expense across all of a client's visits.
  // FIX: same per-currency grouping as generateFromVisit.
  async generateFromClient(req, res) {
    const dbClient = await db.connect();
    try {
      const { client_id, due_date, notes } = req.body;
      if (!client_id) return res.status(400).json({ error: 'client_id is required' });

      await dbClient.query('BEGIN');

      const lockedRows = await ExpenseModel.getUnbilledByClientForUpdate(dbClient, client_id);
      const byCurrency = groupExpenseRowsByCurrency(lockedRows);
      const currencies = Object.keys(byCurrency);

      if (currencies.length === 0) {
        await dbClient.query('ROLLBACK');
        return res.status(400).json({ error: 'No unbilled expenses for this client' });
      }

      const invoices = [];
      for (const currency of currencies) {
        const { total, ids } = byCurrency[currency];
        const invoice = await InvoiceModel.create({
          client_id,
          total_expenses: total,
          total_amount: total,
          currency,
          due_date,
          notes,
        }, dbClient);
        await ExpenseModel.markInvoiced(dbClient, ids, invoice.id);
        invoices.push(invoice);
      }

      await dbClient.query('COMMIT');
      res.status(201).json({ invoices });
    } catch (err) {
      await dbClient.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      dbClient.release();
    }
  },

  // Group invoice — bills every unbilled expense across every visit sharing
  // a group_id (regardless of which member's visit it's attached to) onto
  // invoices billed to whichever member was marked group leader at check-in.
  // FIX: same per-currency grouping. Note the duplicate-invoice guard
  // (getByGroup) only detects a single prior invoice — once a group can
  // produce multiple invoices (one per currency), this dedup check should
  // really be "does an invoice already exist for this group+currency".
  // Flagging this as a follow-up rather than silently changing the guard's
  // meaning here.
  async generateFromGroup(req, res) {
    const dbClient = await db.connect();
    try {
      const { group_id, due_date, notes } = req.body;
      if (!group_id) return res.status(400).json({ error: 'group_id is required' });

      const existing = await InvoiceModel.getByGroup(group_id);
      if (existing) {
        return res.status(409).json({
          error: 'Invoice already exists for this group',
          invoice: existing,
        });
      }

      const { rows: leaderRows } = await db.query(
        `SELECT client_id FROM visits WHERE group_id = $1 AND is_group_leader = true LIMIT 1`,
        [group_id]
      );
      if (!leaderRows.length) return res.status(404).json({ error: 'Group leader not found for this group' });
      const client_id = leaderRows[0].client_id;

      await dbClient.query('BEGIN');

      const lockedRows = await ExpenseModel.getUnbilledByGroupForUpdate(dbClient, group_id);
      const byCurrency = groupExpenseRowsByCurrency(lockedRows);
      const currencies = Object.keys(byCurrency);

      if (currencies.length === 0) {
        await dbClient.query('ROLLBACK');
        return res.status(400).json({ error: 'No unbilled expenses for this group' });
      }

      const invoices = [];
      for (const currency of currencies) {
        const { total, ids } = byCurrency[currency];
        const invoice = await InvoiceModel.create({
          client_id,
          group_id,
          total_expenses: total,
          total_amount: total,
          currency,
          due_date,
          notes,
        }, dbClient);
        await ExpenseModel.markInvoiced(dbClient, ids, invoice.id);
        invoices.push(invoice);
      }

      await dbClient.query('COMMIT');
      res.status(201).json({ invoices });
    } catch (err) {
      await dbClient.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      dbClient.release();
    }
  },

  // Manual invoice — admin enters the amount, description, and currency directly.
  // Either an existing client_id is supplied, or a brand-new client is
  // resolved (found by email, or created) from client_name/client_email/client_phone.
  async createManual(req, res) {
    const dbClient = await db.connect();
    try {
      const { client_id, client_name, client_email, client_phone,
              amount, description, due_date, notes } = req.body;
      let { currency } = req.body;

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

      currency = currency ? String(currency).toUpperCase() : DEFAULT_CURRENCY;
      if (!ALLOWED_CURRENCIES.includes(currency)) {
        return res.status(400).json({ error: `currency must be one of: ${ALLOWED_CURRENCIES.join(', ')}` });
      }

      await dbClient.query('BEGIN');

      let resolvedClientId = client_id || null;

      if (!resolvedClientId) {
        const { rows: clientRows } = await dbClient.query(
          `INSERT INTO clients (full_name, email, phone)
           VALUES ($1, $2, $3)
           ON CONFLICT ((lower(email))) DO UPDATE SET email = clients.email
           RETURNING id`,
          [client_name.trim(), client_email.trim(), client_phone ? String(client_phone).trim() : null]
        );
        resolvedClientId = clientRows[0].id;
      }

      const invoice = await InvoiceModel.create({
        client_id: resolvedClientId,
        total_amount: amountNum,
        currency,
        description: String(description).trim(),
        due_date,
        notes,
      }, dbClient);

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

      const html = await buildInvoiceHtml({ ...invoice, expenses, payments: payments.slice().reverse() });
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

      const html = await buildInvoiceHtml({ ...invoice, expenses, payments: payments.slice().reverse() });
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
const db = require('../config/db');
const InvoiceModel   = require('../model/invoiceModel');
const ExpenseModel   = require('../model/expenseModel');
const PaymentModel   = require('../model/paymentModel');
const { buildInvoiceHtml } = require('../services/invoiceTemplate');
const { generatePdfFromHtml } = require('../services/pdfService');
const { sendInvoiceEmail } = require('../services/emailService');

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
      if (!total_amount && !final_amount) {
        return res.status(400).json({ error: 'total_amount is required' });
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

      // Only unbilled expenses for THIS visit — not the client's other visits
      const total_expenses = await ExpenseModel.getUnbilledByVisit(visit_id);

      if (total_expenses <= 0) {
        return res.status(400).json({ error: 'No unbilled expenses for this visit' });
      }

      await dbClient.query('BEGIN');

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

      const total_expenses = await ExpenseModel.getUnbilledByClient(client_id);

      if (total_expenses <= 0) {
        return res.status(400).json({ error: 'No unbilled expenses for this client' });
      }

      await dbClient.query('BEGIN');

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

  async update(req, res) {
    try {
      const invoice = await InvoiceModel.update(req.params.id, req.body);
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
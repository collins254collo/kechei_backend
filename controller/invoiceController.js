const db = require('../config/db');
const InvoiceModel   = require('../model/invoiceModel');
const ExpenseModel   = require('../model/expenseModel');
const PaymentModel   = require('../model/paymentModel');

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

      const payments   = await PaymentModel.getByInvoice(invoice.id);
      const total_paid = await PaymentModel.getTotalPaid(invoice.id);
      const balance    = parseFloat(invoice.final_amount) - total_paid;

      res.json({ ...invoice, payments, total_paid, balance });
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

  async generateFromVisit(req, res) {
    try {
      const { visit_id, due_date, notes } = req.body;
      if (!visit_id) return res.status(400).json({ error: 'visit_id is required' });

      const existing = await InvoiceModel.getByVisit(visit_id);
      if (existing) {
        return res.status(409).json({ error: 'Invoice already exists for this visit', invoice: existing });
      }

      const { rows: visitRows } = await db.query(
        `SELECT client_id FROM visits WHERE id = $1`, [visit_id]
      );
      if (!visitRows.length) return res.status(404).json({ error: 'Visit not found' });

      const total_expenses = await ExpenseModel.getTotalByVisit(visit_id);
      const invoice = await InvoiceModel.create({
        client_id:    visitRows[0].client_id,
        visit_id,
        total_expenses,
        total_amount:  total_expenses,
        final_amount:  total_expenses,
        due_date,
        notes,
      });
      res.status(201).json(invoice);
    } catch (err) {
      res.status(500).json({ error: err.message });
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
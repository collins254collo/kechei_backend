const InvoiceModel = require('../model/invoiceModel');
const ExpenseModel = require('../model/expenseModel');
const PaymentModel = require('../model/paymentModel');

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

      const payments = await PaymentModel.getByInvoice(invoice.id);
      const total_paid = await PaymentModel.getTotalPaid(invoice.id);
      const balance = parseFloat(invoice.total_amount) - total_paid;

      res.json({ ...invoice, payments, total_paid, balance });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // create invoice manually (not from visit)
  async create(req, res) {
  try {
    const { client_id, visit_id, total_amount, issued_date, due_date, notes } = req.body;
    if (!client_id || !total_amount) {
      return res.status(400).json({ error: 'client_id and total_amount are required' });
    }
    const invoice = await InvoiceModel.create({ client_id, visit_id, total_amount, issued_date, due_date, notes });
    res.status(201).json(invoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
},
  // Generate invoice from a visit — pulls expenses automatically
  async generateFromVisit(req, res) {
    try {
      const { visit_id, total_amount } = req.body;
      if (!visit_id || !total_amount) {
        return res.status(400).json({ error: 'visit_id and total_amount are required' });
      }

      const existing = await InvoiceModel.getByVisit(visit_id);
      if (existing) {
        return res.status(409).json({ error: 'Invoice already exists for this visit', invoice: existing });
      }

      const total_expenses = await ExpenseModel.getTotalByVisit(visit_id);
      const invoice = await InvoiceModel.create({ visit_id, total_expenses, total_amount });
      res.status(201).json(invoice);
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
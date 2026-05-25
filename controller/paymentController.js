const PaymentModel = require('../model/paymentModel');
const InvoiceModel = require('../model/invoiceModel');

const paymentController = {
  async getByInvoice(req, res) {
    try {
      const payments = await PaymentModel.getByInvoice(req.params.invoiceId);
      const total_paid = await PaymentModel.getTotalPaid(req.params.invoiceId);
      res.json({ payments, total_paid });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async create(req, res) {
    try {
      const { invoice_id, amount_paid, method, payment_date, notes } = req.body;
      if (!invoice_id || !amount_paid || !method) {
        return res.status(400).json({ error: 'invoice_id, amount_paid, and method are required' });
      }

      const payment = await PaymentModel.create({ invoice_id, amount_paid, method, payment_date, notes });

      // Auto-update invoice status after each payment
      const invoice = await InvoiceModel.updateStatus(invoice_id);

      res.status(201).json({ payment, invoice_status: invoice.status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      await PaymentModel.delete(req.params.id);
      res.json({ message: 'Payment deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // get All 
async getAll(req, res) {
  try {
    const payments = await PaymentModel.getAll();  
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
},

};

module.exports = paymentController;
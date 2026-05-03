const paymentModel = require('../model/paymentModel');

const VALID_METHODS = ['cash', 'mpesa', 'card'];

// GET /visits/:visitId/payments
exports.getByVisit = async (req, res) => {
  try {
    const data = await paymentModel.findByVisit(req.params.visitId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /payments/:id
exports.getOne = async (req, res) => {
  try {
    const payment = await paymentModel.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /visits/:visitId/payments
exports.create = async (req, res) => {
  try {
    const { amount, method, reference } = req.body;
    const { visitId } = req.params;

    if (!amount || !method) {
      return res.status(400).json({ error: 'amount and method are required' });
    }
    if (Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }
    if (!VALID_METHODS.includes(method)) {
      return res.status(400).json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` });
    }
    if ((method === 'mpesa' || method === 'card') && !reference) {
      return res.status(400).json({ error: `reference is required for ${method} payments` });
    }

    const payment = await paymentModel.create({ visit_id: visitId, amount, method, reference });
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /payments/:id
exports.update = async (req, res) => {
  try {
    const { amount, method, reference } = req.body;

    if (amount !== undefined && Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }
    if (method && !VALID_METHODS.includes(method)) {
      return res.status(400).json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` });
    }

    const payment = await paymentModel.update(req.params.id, { amount, method, reference });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /payments/:id
exports.remove = async (req, res) => {
  try {
    const payment = await paymentModel.softDelete(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json({ message: 'Payment deleted', payment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
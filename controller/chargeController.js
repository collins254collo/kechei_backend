const chargeModel = require('../model/chargeModel');

// GET /visits/:visitId/charges
exports.getByVisit = async (req, res) => {
  try {
    const data = await chargeModel.findByVisit(req.params.visitId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /charges/:id
exports.getOne = async (req, res) => {
  try {
    const charge = await chargeModel.findById(req.params.id);
    if (!charge) return res.status(404).json({ error: 'Charge not found' });
    res.json(charge);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /visits/:visitId/charges
exports.create = async (req, res) => {
  try {
    const { category, amount, description, type = 'service' } = req.body;
    const { visitId } = req.params;

    if (!category || amount === undefined) {
      return res.status(400).json({ error: 'category and amount are required' });
    }
    if (Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }

    const charge = await chargeModel.create({ visit_id: visitId, type, category, amount, description });
    res.status(201).json(charge);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /charges/:id
exports.update = async (req, res) => {
  try {
    const { category, amount, description, type } = req.body;

    if (amount !== undefined && Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }

    const charge = await chargeModel.update(req.params.id, { category, amount, description, type });
    if (!charge) return res.status(404).json({ error: 'Charge not found' });
    res.json(charge);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /charges/:id
exports.remove = async (req, res) => {
  try {
    const charge = await chargeModel.softDelete(req.params.id);
    if (!charge) return res.status(404).json({ error: 'Charge not found' });
    res.json({ message: 'Charge deleted', charge });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
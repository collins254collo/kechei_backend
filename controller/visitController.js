const visitModel = require('../model/visitModel');

const VALID_STATUSES = ['active', 'completed', 'cancelled'];

// GET /visits
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, client_id } = req.query;
    const filters = {};
    if (status) filters.status = status;
    if (client_id) filters.client_id = client_id;

    const result = await visitModel.findAll({ filters, page: +page, limit: +limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /visits/active
exports.getActive = async (req, res) => {
  try {
    const data = await visitModel.findActive();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /visits/:id
exports.getOne = async (req, res) => {
  try {
    const visit = await visitModel.findWithDetails(req.params.id);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    res.json(visit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /visits/:id/summary
exports.getSummary = async (req, res) => {
  try {
    const summary = await visitModel.getSummary(req.params.id);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /visits
exports.create = async (req, res) => {
  try {
    const { client_id, check_in_date, check_out_date, status } = req.body;

    if (!client_id || !check_in_date) {
      return res.status(400).json({ error: 'client_id and check_in_date are required' });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const visit = await visitModel.create({ client_id, check_in_date, check_out_date, status });
    res.status(201).json(visit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /visits/:id
exports.update = async (req, res) => {
  try {
    const { check_in_date, check_out_date, status } = req.body;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const visit = await visitModel.update(req.params.id, { check_in_date, check_out_date, status });
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    res.json(visit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /visits/:id/status
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const visit = await visitModel.updateStatus(req.params.id, status);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    res.json(visit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /visits/:id
exports.remove = async (req, res) => {
  try {
    const visit = await visitModel.softDelete(req.params.id);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    res.json({ message: 'Visit deleted', visit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
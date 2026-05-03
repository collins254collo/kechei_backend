const clientModel = require('../model/clientModel');

// GET /clients
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 20, nationality } = req.query;
    const filters = {};
    if (nationality) filters.nationality = nationality;

    const result = await clientModel.findAll({ filters, page: +page, limit: +limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /clients/:id
exports.getOne = async (req, res) => {
  try {
    const client = await clientModel.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /clients/:id/visits
exports.getWithVisits = async (req, res) => {
  try {
    const client = await clientModel.findWithVisits(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /clients
exports.create = async (req, res) => {
  try {
    const { full_name, phone, nationality, notes } = req.body;

    if (!full_name || !phone) {
      return res.status(400).json({ error: 'full_name and phone are required' });
    }

    const existing = await clientModel.findByPhone(phone);
    if (existing) {
      return res.status(409).json({ error: 'A client with this phone already exists' });
    }

    const client = await clientModel.create({ full_name, phone, nationality, notes });
    res.status(201).json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /clients/:id
exports.update = async (req, res) => {
  try {
    const { full_name, phone, nationality, notes } = req.body;

    if (phone) {
      const existing = await clientModel.findByPhone(phone);
      if (existing && existing.id !== req.params.id) {
        return res.status(409).json({ error: 'Phone already in use by another client' });
      }
    }

    const client = await clientModel.update(req.params.id, { full_name, phone, nationality, notes });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /clients/:id
exports.remove = async (req, res) => {
  try {
    const client = await clientModel.softDelete(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: 'Client deleted', client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
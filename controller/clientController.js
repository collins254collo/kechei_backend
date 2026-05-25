const ClientModel = require('../model/clientModel');

const clientController = {
  async getAll(req, res) {
    try {
      const clients = await ClientModel.getAll();
      res.json(clients);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const client = await ClientModel.getById(req.params.id);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      res.json(client);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async search(req, res) {
    try {
      const { q } = req.query;
      if (!q) return res.status(400).json({ error: 'Search term required' });
      const results = await ClientModel.search(q);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

 async create(req, res) {
  try {
    const { full_name, phone, email, nationality, notes } = req.body;
    if (!full_name || !phone) {
      return res.status(400).json({ error: 'full_name and phone are required' });
    }
    const client = await ClientModel.create({ full_name, phone, email, nationality, notes });
    res.status(201).json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
},

  async update(req, res) {
    try {
      const client = await ClientModel.update(req.params.id, req.body);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      res.json(client);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      await ClientModel.delete(req.params.id);
      res.json({ message: 'Client deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

async getProfile(req, res) {
  try {
    const profile = await ClientModel.getProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Client not found' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
},
};

module.exports = clientController;
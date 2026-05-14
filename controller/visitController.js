const VisitModel = require('../model/visitModel');

const visitController = {
  async getByClient(req, res) {
    try {
      const visits = await VisitModel.getByClient(req.params.clientId);
      res.json(visits);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getActive(req, res) {
    try {
      const visits = await VisitModel.getActive();
      res.json(visits);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const visit = await VisitModel.getById(req.params.id);
      if (!visit) return res.status(404).json({ error: 'Visit not found' });
      res.json(visit);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

 async create(req, res) {
  try {
    const { client_id, reason, notes } = req.body;
    if (!client_id || !reason?.trim()) {
      return res.status(400).json({ error: 'client_id and reason are required' });
    }
    const visit = await VisitModel.create({ client_id, reason, notes });
    res.status(201).json(visit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
},

  async complete(req, res) {
    try {
      const visit = await VisitModel.complete(req.params.id);
      if (!visit) return res.status(404).json({ error: 'Visit not found' });
      res.json(visit);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const visit = await VisitModel.update(req.params.id, req.body);
      if (!visit) return res.status(404).json({ error: 'Visit not found' });
      res.json(visit);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      await VisitModel.delete(req.params.id);
      res.json({ message: 'Visit deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = visitController;
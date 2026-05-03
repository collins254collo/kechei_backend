const globalExpenseModel = require('../model/globalExpenseModel');

// GET /expenses
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 20, from, to, category } = req.query;

    if (from && to) {
      const data = await globalExpenseModel.findByDateRange(from, to);
      return res.json(data);
    }

    const filters = {};
    if (category) filters.category = category;

    const result = await globalExpenseModel.findAll({ filters, page: +page, limit: +limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /expenses/summary
exports.getSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    const totals = await globalExpenseModel.totalByCategory(from, to);
    const grandTotal = Object.values(totals).reduce((sum, v) => sum + v, 0);
    res.json({ totals_by_category: totals, grand_total: grandTotal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /expenses/:id
exports.getOne = async (req, res) => {
  try {
    const expense = await globalExpenseModel.findById(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /expenses
exports.create = async (req, res) => {
  try {
    const { category, amount, date, notes } = req.body;

    if (!category || amount === undefined || !date) {
      return res.status(400).json({ error: 'category, amount, and date are required' });
    }
    if (Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }

    const expense = await globalExpenseModel.create({ category, amount, date, notes });
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /expenses/:id
exports.update = async (req, res) => {
  try {
    const { category, amount, date, notes } = req.body;

    if (amount !== undefined && Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }

    const expense = await globalExpenseModel.update(req.params.id, { category, amount, date, notes });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /expenses/:id
exports.remove = async (req, res) => {
  try {
    const expense = await globalExpenseModel.softDelete(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.json({ message: 'Expense deleted', expense });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
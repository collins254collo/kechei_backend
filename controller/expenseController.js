const ExpenseModel = require('../model/expenseModel');

const ALLOWED_CURRENCIES = ['KES', 'USD', 'EUR'];
const DEFAULT_CURRENCY = 'KES';

const expenseController = {
  async getByVisit(req, res) {
    try {
      const expenses = await ExpenseModel.getByVisit(req.params.visitId);
      // total is now an array grouped by currency, e.g.
      // [{ currency: 'KES', total: 5000 }, { currency: 'USD', total: 120 }]
      const total = await ExpenseModel.getTotalByVisit(req.params.visitId);
      res.json({ expenses, total });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

 async create(req, res) {
  try {
    const { visit_id, category, amount, expense_date, description } = req.body;
    let { currency } = req.body;

    if (!visit_id || !category || !amount) {
      return res.status(400).json({ error: 'visit_id, category, and amount are required' });
    }

    currency = currency ? String(currency).toUpperCase() : DEFAULT_CURRENCY;
    if (!ALLOWED_CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: `currency must be one of: ${ALLOWED_CURRENCIES.join(', ')}` });
    }

    const expense = await ExpenseModel.create({ visit_id, category, amount, currency, expense_date, description });
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
},

  async update(req, res) {
    try {
      const body = { ...req.body };
      if (body.currency !== undefined) {
        body.currency = String(body.currency).toUpperCase();
        if (!ALLOWED_CURRENCIES.includes(body.currency)) {
          return res.status(400).json({ error: `currency must be one of: ${ALLOWED_CURRENCIES.join(', ')}` });
        }
      }
      const expense = await ExpenseModel.update(req.params.id, body);
      if (!expense) return res.status(404).json({ error: 'Expense not found' });
      res.json(expense);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      await ExpenseModel.delete(req.params.id);
      res.json({ message: 'Expense deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

async getAll(req, res) {
  try {
    const expenses = await ExpenseModel.getAll();
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
},
};


module.exports = expenseController;
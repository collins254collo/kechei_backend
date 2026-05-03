const BaseModel = require('./BaseModel');

class GlobalExpenseModel extends BaseModel {
  constructor() {
    super('global_expenses');
  }

  async findByDateRange(from, to) {
    const { data, error } = await this.query()
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async totalByCategory(from, to) {
    let q = this.query().select('category, amount');
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);

    const { data, error } = await q;
    if (error) throw error;

    return data.reduce((acc, row) => {
      acc[row.category] = (acc[row.category] || 0) + Number(row.amount);
      return acc;
    }, {});
  }
}

module.exports = new GlobalExpenseModel();
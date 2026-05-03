const BaseModel = require('./BaseModel');

class ChargeModel extends BaseModel {
  constructor() {
    super('charges');
  }

  async findByVisit(visitId) {
    const { data, error } = await this.query()
      .select('*')
      .eq('visit_id', visitId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async totalForVisit(visitId) {
    const { data, error } = await this.query()
      .select('amount')
      .eq('visit_id', visitId);
    if (error) throw error;
    return data.reduce((sum, c) => sum + Number(c.amount), 0);
  }
}

module.exports = new ChargeModel();
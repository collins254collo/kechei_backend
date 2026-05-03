const BaseModel = require('./BaseModel');

class PaymentModel extends BaseModel {
  constructor() {
    super('payments');
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
    return data.reduce((sum, p) => sum + Number(p.amount), 0);
  }
}

module.exports = new PaymentModel();
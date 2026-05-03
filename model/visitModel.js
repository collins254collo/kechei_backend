const BaseModel = require('./BaseModel');

class VisitModel extends BaseModel {
  constructor() {
    super('visits');
  }

  async findWithDetails(id) {
    const { data, error } = await this.db
      .from('visits')
      .select(`
        *,
        clients (*),
        charges (*),
        payments (*)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    if (error) throw error;
    return data;
  }

  async findByClient(clientId) {
    const { data, error } = await this.query()
      .select('*, charges(*), payments(*)')
      .eq('client_id', clientId)
      .is('charges.deleted_at', null)
      .is('payments.deleted_at', null)
      .order('check_in_date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async findActive() {
    const { data, error } = await this.query()
      .select('*, clients(id, full_name, phone)')
      .eq('status', 'active')
      .order('check_in_date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async updateStatus(id, status) {
    return this.update(id, {
      status,
      ...(status === 'completed' ? { check_out_date: new Date().toISOString().split('T')[0] } : {}),
    });
  }

  // Total charged vs total paid for a visit
  async getSummary(visitId) {
    const { data, error } = await this.db
      .from('visits')
      .select(`
        id,
        status,
        check_in_date,
        check_out_date,
        charges (amount, deleted_at),
        payments (amount, deleted_at)
      `)
      .eq('id', visitId)
      .single();
    if (error) throw error;

    const totalCharged = data.charges
      .filter((c) => !c.deleted_at)
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const totalPaid = data.payments
      .filter((p) => !p.deleted_at)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      visit_id: data.id,
      status: data.status,
      check_in_date: data.check_in_date,
      check_out_date: data.check_out_date,
      total_charged: totalCharged,
      total_paid: totalPaid,
      balance: totalCharged - totalPaid,
    };
  }
}

module.exports = new VisitModel();
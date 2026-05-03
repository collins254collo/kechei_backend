const BaseModel = require('./BaseModel');

class ClientModel extends BaseModel {
  constructor() {
    super('clients');
  }

  async findByPhone(phone) {
    const { data, error } = await this.query()
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // Client with all their visits
  async findWithVisits(id) {
    const { data, error } = await this.db
      .from('clients')
      .select(`
        *,
        visits (
          *,
          charges (*),
          payments (*)
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .is('visits.deleted_at', null)
      .single();
    if (error) throw error;
    return data;
  }
}

module.exports = new ClientModel();
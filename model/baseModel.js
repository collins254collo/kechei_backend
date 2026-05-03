const supabase = require('../config/supabase');

class BaseModel {
  constructor(table) {
    this.table = table;
    this.db = supabase;
  }

  // Active records only (soft-delete aware)
  query() {
    return this.db.from(this.table).is('deleted_at', null);
  }

  async findAll({ filters = {}, page = 1, limit = 20 } = {}) {
    let q = this.query().select('*');

    for (const [key, value] of Object.entries(filters)) {
      q = q.eq(key, value);
    }

    const from = (page - 1) * limit;
    q = q.range(from, from + limit - 1).order('created_at', { ascending: false });

    const { data, error, count } = await q;
    if (error) throw error;
    return { data, count };
  }

  async findById(id) {
    const { data, error } = await this.query()
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async create(payload) {
    const { data, error } = await this.db
      .from(this.table)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async update(id, payload) {
    const { data, error } = await this.db
      .from(this.table)
      .update(payload)
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async softDelete(id) {
    const { data, error } = await this.db
      .from(this.table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

module.exports = BaseModel;
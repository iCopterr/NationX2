// ============================================================
// Resource Model
// ============================================================
import { query, queryOne } from '../database/pool';
import { ResourceType } from '../types';

export interface Resource {
  id: string;
  country_id: string;
  type: ResourceType;
  amount: number;
  capacity: number;
  per_tick: number;
  updated_at: Date;
}

export const ResourceModel = {
  async findByCountry(countryId: string): Promise<Resource[]> {
    return query<Resource>(
      'SELECT * FROM resources WHERE country_id = $1',
      [countryId]
    );
  },

  async findOne(countryId: string, type: ResourceType): Promise<Resource | null> {
    return queryOne<Resource>(
      'SELECT * FROM resources WHERE country_id = $1 AND type = $2',
      [countryId, type]
    );
  },

  /** Upsert a resource row */
  async upsert(countryId: string, type: ResourceType, defaults: { capacity?: number; per_tick?: number } = {}): Promise<Resource> {
    const row = await queryOne<Resource>(
      `INSERT INTO resources (country_id, type, capacity, per_tick)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (country_id, type)
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [countryId, type, defaults.capacity ?? 100000, defaults.per_tick ?? 0]
    );
    if (!row) throw new Error('Upsert failed');
    return row;
  },

  /** Adjust resource by delta — enforces 0 and capacity limits */
  async adjust(countryId: string, type: ResourceType, delta: number): Promise<Resource | null> {
    return queryOne<Resource>(
      `UPDATE resources
       SET amount = GREATEST(0, LEAST(capacity, amount + $3)),
           updated_at = NOW()
       WHERE country_id = $1 AND type = $2
       RETURNING *`,
      [countryId, type, delta]
    );
  },

  /** Check if sufficient amount available */
  async hasSufficient(countryId: string, type: ResourceType, needed: number): Promise<boolean> {
    const row = await queryOne<{ amount: string }>(
      'SELECT amount FROM resources WHERE country_id = $1 AND type = $2',
      [countryId, type]
    );
    return parseFloat(row?.amount ?? '0') >= needed;
  },

  async updatePerTick(countryId: string, type: ResourceType, perTick: number): Promise<void> {
    await query(
      `UPDATE resources SET per_tick = $3, updated_at = NOW()
       WHERE country_id = $1 AND type = $2`,
      [countryId, type, perTick]
    );
  },
};

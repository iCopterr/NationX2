// ============================================================
// Policy Model
// ============================================================
import { query, queryOne } from '../database/pool';
import { PolicySector } from '../types';

export interface Policy {
  id: string;
  country_id: string;
  name: string;
  description: string;
  sector: PolicySector;
  cost_money: number;
  cost_per_tick: number;
  effects: Record<string, number>;
  is_active: boolean;
  enacted_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}

export interface PolicyAllocation {
  id: string;
  country_id: string;
  education: number;
  military: number;
  technology: number;
  economy: number;
  healthcare: number;
  infrastructure: number;
  updated_at: Date;
}

export interface UpdateAllocationDto {
  education?: number;
  military?: number;
  technology?: number;
  economy?: number;
  healthcare?: number;
  infrastructure?: number;
}

export const PolicyModel = {
  async findByCountry(countryId: string): Promise<Policy[]> {
    return query<Policy>(
      'SELECT * FROM policies WHERE country_id = $1 ORDER BY created_at DESC',
      [countryId]
    );
  },

  async findActiveByCountry(countryId: string): Promise<Policy[]> {
    return query<Policy>(
      'SELECT * FROM policies WHERE country_id = $1 AND is_active = TRUE',
      [countryId]
    );
  },

  async findById(id: string): Promise<Policy | null> {
    return queryOne<Policy>('SELECT * FROM policies WHERE id = $1', [id]);
  },

  async create(data: Omit<Policy, 'id' | 'is_active' | 'enacted_at' | 'expires_at' | 'created_at'>): Promise<Policy> {
    const row = await queryOne<Policy>(
      `INSERT INTO policies (country_id, name, description, sector, cost_money, cost_per_tick, effects)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.country_id, data.name, data.description, data.sector,
       data.cost_money, data.cost_per_tick, JSON.stringify(data.effects)]
    );
    if (!row) throw new Error('Failed to create policy');
    return row;
  },

  async enact(id: string, countryId: string): Promise<Policy | null> {
    return queryOne<Policy>(
      `UPDATE policies SET is_active = TRUE, enacted_at = NOW()
       WHERE id = $1 AND country_id = $2 RETURNING *`,
      [id, countryId]
    );
  },

  async repeal(id: string, countryId: string): Promise<Policy | null> {
    return queryOne<Policy>(
      `UPDATE policies SET is_active = FALSE, enacted_at = NULL
       WHERE id = $1 AND country_id = $2 RETURNING *`,
      [id, countryId]
    );
  },

  // ── Allocations ──────────────────────────────────────────────
  async getAllocation(countryId: string): Promise<PolicyAllocation | null> {
    return queryOne<PolicyAllocation>(
      'SELECT * FROM policy_allocations WHERE country_id = $1',
      [countryId]
    );
  },

  async upsertAllocation(countryId: string, alloc: UpdateAllocationDto): Promise<PolicyAllocation> {
    const current = await PolicyModel.getAllocation(countryId) ?? {
      education: 0, military: 0, technology: 0, economy: 0, healthcare: 0, infrastructure: 0,
    };

    const merged = {
      education: alloc.education ?? (current as PolicyAllocation).education ?? 0,
      military: alloc.military ?? (current as PolicyAllocation).military ?? 0,
      technology: alloc.technology ?? (current as PolicyAllocation).technology ?? 0,
      economy: alloc.economy ?? (current as PolicyAllocation).economy ?? 0,
      healthcare: alloc.healthcare ?? (current as PolicyAllocation).healthcare ?? 0,
      infrastructure: alloc.infrastructure ?? (current as PolicyAllocation).infrastructure ?? 0,
    };

    const total = Object.values(merged).reduce((a, b) => a + b, 0);
    if (total > 100) {
      throw new Error(`Total allocation ${total}% exceeds 100%`);
    }

    const row = await queryOne<PolicyAllocation>(
      `INSERT INTO policy_allocations (country_id, education, military, technology, economy, healthcare, infrastructure)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (country_id) DO UPDATE SET
         education = $2, military = $3, technology = $4,
         economy = $5, healthcare = $6, infrastructure = $7,
         updated_at = NOW()
       RETURNING *`,
      [countryId, merged.education, merged.military, merged.technology,
       merged.economy, merged.healthcare, merged.infrastructure]
    );
    if (!row) throw new Error('Allocation upsert failed');
    return row;
  },
};

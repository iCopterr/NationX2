// ============================================================
// Resource Model — Data layer for the Resource System
// ============================================================
import { query, queryOne } from '../database/pool';
import { ResourceType, ResourceConfig } from '../types';

// ─── Resource Config Registry ────────────────────────────────
// One entry per resource type. To add a new resource:
//   1. Add the type to ResourceType in types/index.ts
//   2. Add an entry here
// No other files need to change.
export const RESOURCE_CONFIG: Record<ResourceType, ResourceConfig> = {
  metal: {
    label: 'Metal',
    description: 'Raw ore and refined metals for construction and manufacturing.',
    defaultCapacity: 100_000,
    baseProduction: 10,
    baseConsumption: 3,
    knowledgeBoost: 'engineering',
    exploreBaseYieldPct: 0.06,
    deficitHappinessPenalty: 1.0,
  },
  energy: {
    label: 'Energy',
    description: 'Electrical power for industry, cities, and military.',
    defaultCapacity: 100_000,
    baseProduction: 15,
    baseConsumption: 10,
    knowledgeBoost: 'technology',
    exploreBaseYieldPct: 0.05,
    deficitHappinessPenalty: 2.5,   // power cuts hurt happiness hard
  },
  food: {
    label: 'Food',
    description: 'Agricultural produce feeding the population.',
    defaultCapacity: 100_000,
    baseProduction: 20,
    baseConsumption: 12,
    knowledgeBoost: 'science',
    exploreBaseYieldPct: 0.08,
    deficitHappinessPenalty: 3.0,   // famine = highest penalty
  },
  // ── Expansion slots ──────────────────────────────────────────
  oil: {
    label: 'Oil',
    description: 'Fossil fuel for vehicles and heavy industry.',
    defaultCapacity: 100_000,
    baseProduction: 5,
    baseConsumption: 3,
    knowledgeBoost: 'engineering',
    exploreBaseYieldPct: 0.04,
    deficitHappinessPenalty: 1.5,
  },
  water: {
    label: 'Water',
    description: 'Fresh water for agriculture and urban supply.',
    defaultCapacity: 100_000,
    baseProduction: 25,
    baseConsumption: 8,
    knowledgeBoost: 'science',
    exploreBaseYieldPct: 0.10,
    deficitHappinessPenalty: 2.0,
  },
  rare_earth: {
    label: 'Rare Earth',
    description: 'Scarce minerals critical for advanced electronics and weapons.',
    defaultCapacity: 50_000,
    baseProduction: 2,
    baseConsumption: 0,
    knowledgeBoost: 'technology',
    exploreBaseYieldPct: 0.02,      // hard to find
    deficitHappinessPenalty: 0.5,
  },
};

// ─── DB Row ──────────────────────────────────────────────────
export interface ResourceRow {
  id: string;
  country_id: string;
  type: ResourceType;
  amount: number;
  capacity: number;
  per_tick: number;         // net production rate (cached)
  updated_at: Date;
}

// ─── Log entry ───────────────────────────────────────────────
export type ResourceLogAction = 'produce' | 'consume' | 'explore' | 'trade' | 'adjust';

export interface ResourceLogRow {
  id: string;
  country_id: string;
  type: ResourceType;
  action: ResourceLogAction;
  delta: number;
  amount_before: number;
  amount_after: number;
  source: string;
  logged_at: Date;
}

// ─── Model ───────────────────────────────────────────────────
export const ResourceModel = {
  // ── Read ──────────────────────────────────────────────────
  async findByCountry(countryId: string): Promise<ResourceRow[]> {
    return query<ResourceRow>(
      'SELECT * FROM resources WHERE country_id = $1 ORDER BY type',
      [countryId]
    );
  },

  async findOne(countryId: string, type: ResourceType): Promise<ResourceRow | null> {
    return queryOne<ResourceRow>(
      'SELECT * FROM resources WHERE country_id = $1 AND type = $2',
      [countryId, type]
    );
  },

  // ── Ensure row exists ─────────────────────────────────────
  async ensureExists(
    countryId: string,
    type: ResourceType,
    overrides: { capacity?: number; per_tick?: number } = {}
  ): Promise<ResourceRow> {
    const cfg = RESOURCE_CONFIG[type];
    const row = await queryOne<ResourceRow>(
      `INSERT INTO resources (country_id, type, capacity, per_tick)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (country_id, type)
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [
        countryId,
        type,
        overrides.capacity ?? cfg.defaultCapacity,
        overrides.per_tick ?? 0,
      ]
    );
    if (!row) throw new Error(`Resource ensureExists failed: ${type}`);
    return row;
  },

  // ── Atomic delta — DB enforces [0, capacity] bounds ──────
  async adjust(
    countryId: string,
    type: ResourceType,
    delta: number,
    source: ResourceLogAction = 'adjust'
  ): Promise<{ before: number; after: number; row: ResourceRow }> {
    // Read current for log
    const current = await ResourceModel.findOne(countryId, type);
    const amountBefore = Number(current?.amount ?? 0);

    const updated = await queryOne<ResourceRow>(
      `UPDATE resources
       SET amount     = GREATEST(0, LEAST(capacity, amount + $3)),
           per_tick   = per_tick,
           updated_at = NOW()
       WHERE country_id = $1 AND type = $2
       RETURNING *`,
      [countryId, type, delta]
    );
    if (!updated) throw new Error(`Resource not found for adjust: ${type}`);

    const amountAfter = Number(updated.amount);

    // Log the change
    await ResourceModel.log({
      countryId,
      type,
      action: source,
      delta,
      amountBefore,
      amountAfter,
    });

    return { before: amountBefore, after: amountAfter, row: updated };
  },

  // ── Availability check ────────────────────────────────────
  async getAmount(countryId: string, type: ResourceType): Promise<number> {
    const row = await queryOne<{ amount: string }>(
      'SELECT amount FROM resources WHERE country_id = $1 AND type = $2',
      [countryId, type]
    );
    return parseFloat(row?.amount ?? '0');
  },

  async hasSufficient(countryId: string, type: ResourceType, needed: number): Promise<boolean> {
    const amount = await ResourceModel.getAmount(countryId, type);
    return amount >= needed;
  },

  // ── Update per-tick rate (called when infrastructure changes) ─
  async updatePerTick(countryId: string, type: ResourceType, perTick: number): Promise<void> {
    await query(
      `UPDATE resources SET per_tick = $3, updated_at = NOW()
       WHERE country_id = $1 AND type = $2`,
      [countryId, type, perTick]
    );
  },

  // ── Audit log ─────────────────────────────────────────────
  async log(entry: {
    countryId: string;
    type: ResourceType;
    action: ResourceLogAction;
    delta: number;
    amountBefore: number;
    amountAfter: number;
    source?: string;
  }): Promise<void> {
    await query(
      `INSERT INTO resource_logs
         (country_id, type, action, delta, amount_before, amount_after, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        entry.countryId,
        entry.type,
        entry.action,
        entry.delta,
        entry.amountBefore,
        entry.amountAfter,
        entry.source ?? entry.action,
      ]
    );
  },

  async getLogs(
    countryId: string,
    type?: ResourceType,
    limit = 50
  ): Promise<ResourceLogRow[]> {
    if (type) {
      return query<ResourceLogRow>(
        `SELECT * FROM resource_logs WHERE country_id = $1 AND type = $2
         ORDER BY logged_at DESC LIMIT $3`,
        [countryId, type, limit]
      );
    }
    return query<ResourceLogRow>(
      `SELECT * FROM resource_logs WHERE country_id = $1
       ORDER BY logged_at DESC LIMIT $2`,
      [countryId, limit]
    );
  },
};

// ============================================================
// Knowledge Model
// ============================================================
import { query, queryOne } from '../database/pool';
import { KnowledgeType } from '../types';

export interface Knowledge {
  id: string;
  country_id: string;
  type: KnowledgeType;
  level: number;
  max_level: number;
  xp: number;
  updated_at: Date;
}

/** XP required to advance from level N to N+1 (exponential curve) */
export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level));
}

export const KnowledgeModel = {
  async findByCountry(countryId: string): Promise<Knowledge[]> {
    return query<Knowledge>(
      'SELECT * FROM knowledge WHERE country_id = $1',
      [countryId]
    );
  },

  async findOne(countryId: string, type: KnowledgeType): Promise<Knowledge | null> {
    return queryOne<Knowledge>(
      'SELECT * FROM knowledge WHERE country_id = $1 AND type = $2',
      [countryId, type]
    );
  },

  async upsert(countryId: string, type: KnowledgeType): Promise<Knowledge> {
    const row = await queryOne<Knowledge>(
      `INSERT INTO knowledge (country_id, type)
       VALUES ($1, $2)
       ON CONFLICT (country_id, type) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [countryId, type]
    );
    if (!row) throw new Error('Knowledge upsert failed');
    return row;
  },

  async addXp(countryId: string, type: KnowledgeType, xpGain: number): Promise<Knowledge> {
    // Fetch current state
    const current = await KnowledgeModel.upsert(countryId, type);
    let { level, xp, max_level } = current;
    xp += xpGain;

    // Level-up loop
    while (level < max_level) {
      const needed = xpForLevel(level);
      if (xp < needed) break;
      xp -= needed;
      level++;
    }

    const row = await queryOne<Knowledge>(
      `UPDATE knowledge SET level = $3, xp = $4, updated_at = NOW()
       WHERE country_id = $1 AND type = $2
       RETURNING *`,
      [countryId, type, level, xp]
    );
    if (!row) throw new Error('Failed to update knowledge');
    return row;
  },

  async meetsRequirements(
    countryId: string,
    requirements: Array<{ type: KnowledgeType; minLevel: number }>
  ): Promise<{ met: boolean; missing: Array<{ type: KnowledgeType; required: number; current: number }> }> {
    const knowledgeRows = await KnowledgeModel.findByCountry(countryId);
    const map = new Map(knowledgeRows.map((k) => [k.type, k.level]));

    const missing: Array<{ type: KnowledgeType; required: number; current: number }> = [];
    for (const req of requirements) {
      const current = map.get(req.type) ?? 0;
      if (current < req.minLevel) {
        missing.push({ type: req.type, required: req.minLevel, current });
      }
    }

    return { met: missing.length === 0, missing };
  },
};

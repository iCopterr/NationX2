// ============================================================
// Knowledge Model — Data layer for the Knowledge System
// ============================================================
import { query, queryOne } from '../database/pool';
import { KnowledgeType, KnowledgeLevel, AddKnowledgeResult } from '../types';

// ─── Knowledge Config Registry ───────────────────────────────
// Each knowledge type can have its own XP curve, cap, and metadata.
// To add a new type: add it to KnowledgeType in types/index.ts,
// then register it here. No other files need to change.
export interface KnowledgeTypeConfig {
  /** Human-readable name */
  label: string;
  /** Short description shown in UI */
  description: string;
  /** Maximum achievable level */
  maxLevel: number;
  /** Base XP needed for level 1 (curve scales from this) */
  baseXp: number;
  /** Exponential growth factor per level */
  xpScaleFactor: number;
  /** Which policy sector passively boosts this type */
  allocationSector: string;
}

export const KNOWLEDGE_CONFIG: Record<KnowledgeType, KnowledgeTypeConfig> = {
  technology: {
    label: 'Technology',
    description: 'Advances in computing, automation, and civilian tech.',
    maxLevel: 100,
    baseXp: 100,
    xpScaleFactor: 1.5,
    allocationSector: 'technology',
  },
  military: {
    label: 'Military',
    description: 'Tactical doctrine, weaponry, and defence systems.',
    maxLevel: 100,
    baseXp: 100,
    xpScaleFactor: 1.5,
    allocationSector: 'military',
  },
  engineering: {
    label: 'Engineering',
    description: 'Civil and mechanical engineering for infrastructure and production.',
    maxLevel: 100,
    baseXp: 100,
    xpScaleFactor: 1.5,
    allocationSector: 'infrastructure',
  },
  science: {
    label: 'Science',
    description: 'Fundamental research driving long-term breakthroughs.',
    maxLevel: 100,
    baseXp: 100,
    xpScaleFactor: 1.5,
    allocationSector: 'education',
  },
  // ── Expansion slots ─────────────────────────────────────────
  economics: {
    label: 'Economics',
    description: 'Trade theory, fiscal policy, and macroeconomics.',
    maxLevel: 100,
    baseXp: 100,
    xpScaleFactor: 1.5,
    allocationSector: 'economy',
  },
  medicine: {
    label: 'Medicine',
    description: 'Healthcare, epidemiology, and biotech research.',
    maxLevel: 100,
    baseXp: 100,
    xpScaleFactor: 1.5,
    allocationSector: 'healthcare',
  },
};

// ─── DB Row ─────────────────────────────────────────────────
export interface KnowledgeRow {
  id: string;
  country_id: string;
  type: KnowledgeType;
  level: number;
  max_level: number;
  xp: number;
  updated_at: Date;
}

// ─── XP Math ─────────────────────────────────────────────────
/**
 * XP required to advance from level N to N+1.
 * Uses per-type config so different domains can scale differently.
 */
export function xpForLevel(level: number, type: KnowledgeType): number {
  const cfg = KNOWLEDGE_CONFIG[type];
  return Math.floor(cfg.baseXp * Math.pow(cfg.xpScaleFactor, level));
}

/**
 * Build a KnowledgeLevel view object from a raw DB row.
 */
export function toKnowledgeLevel(row: KnowledgeRow): KnowledgeLevel {
  const xpNeeded = xpForLevel(row.level, row.type);
  return {
    type: row.type,
    level: row.level,
    xp: row.xp,
    xpToNextLevel: xpNeeded,
    maxLevel: row.max_level,
    progressPct: row.level >= row.max_level
      ? 100
      : Math.min(100, Math.round((row.xp / xpNeeded) * 100)),
  };
}

// ─── Model ───────────────────────────────────────────────────
export const KnowledgeModel = {
  /** Get all knowledge rows for a country */
  async findByCountry(countryId: string): Promise<KnowledgeRow[]> {
    return query<KnowledgeRow>(
      'SELECT * FROM knowledge WHERE country_id = $1 ORDER BY type',
      [countryId]
    );
  },

  /** Get a single knowledge row */
  async findOne(countryId: string, type: KnowledgeType): Promise<KnowledgeRow | null> {
    return queryOne<KnowledgeRow>(
      'SELECT * FROM knowledge WHERE country_id = $1 AND type = $2',
      [countryId, type]
    );
  },

  /**
   * Ensure a knowledge row exists for this (country, type) pair.
   * Idempotent — safe to call before any read-modify-write.
   */
  async ensureExists(countryId: string, type: KnowledgeType): Promise<KnowledgeRow> {
    const cfg = KNOWLEDGE_CONFIG[type];
    const row = await queryOne<KnowledgeRow>(
      `INSERT INTO knowledge (country_id, type, max_level)
       VALUES ($1, $2, $3)
       ON CONFLICT (country_id, type) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [countryId, type, cfg.maxLevel]
    );
    if (!row) throw new Error(`Knowledge ensureExists failed for type: ${type}`);
    return row;
  },

  /**
   * Apply an XP gain to a knowledge row. Handles levelling-up
   * in a loop and caps at max_level. Returns the updated row.
   */
  async applyXpGain(
    countryId: string,
    type: KnowledgeType,
    xpGain: number
  ): Promise<{ row: KnowledgeRow; result: AddKnowledgeResult }> {
    const current = await KnowledgeModel.ensureExists(countryId, type);

    let level = Number(current.level);
    let xp = Number(current.xp) + xpGain;
    const levelBefore = level;
    const maxLevel = Number(current.max_level);

    // Level-up loop — drain XP until insufficient for next level
    while (level < maxLevel) {
      const needed = xpForLevel(level, type);
      if (xp < needed) break;
      xp -= needed;
      level++;
    }

    // If at max level, surplus XP is discarded (no overflow exploit)
    if (level >= maxLevel) {
      level = maxLevel;
      xp = 0;
    }

    const updated = await queryOne<KnowledgeRow>(
      `UPDATE knowledge
       SET level = $3, xp = $4, updated_at = NOW()
       WHERE country_id = $1 AND type = $2
       RETURNING *`,
      [countryId, type, level, xp]
    );
    if (!updated) throw new Error('Knowledge update failed');

    const result: AddKnowledgeResult = {
      type,
      amountAdded: xpGain,
      levelBefore,
      levelAfter: level,
      levelsGained: level - levelBefore,
      xpNow: xp,
      xpToNextLevel: level < maxLevel ? xpForLevel(level, type) : 0,
    };

    return { row: updated, result };
  },

  /**
   * Check whether a country meets all requirements.
   * Returns full detail on what's missing (for clear error messages).
   */
  async meetsRequirements(
    countryId: string,
    requirements: Array<{ type: KnowledgeType; minLevel: number }>
  ): Promise<{
    met: boolean;
    missing: Array<{ type: KnowledgeType; required: number; current: number; label: string }>;
  }> {
    const rows = await KnowledgeModel.findByCountry(countryId);
    const levelMap = new Map(rows.map((r) => [r.type, Number(r.level)]));

    const missing: Array<{ type: KnowledgeType; required: number; current: number; label: string }> = [];

    for (const req of requirements) {
      const current = levelMap.get(req.type) ?? 0;
      if (current < req.minLevel) {
        missing.push({
          type: req.type,
          required: req.minLevel,
          current,
          label: KNOWLEDGE_CONFIG[req.type]?.label ?? req.type,
        });
      }
    }

    return { met: missing.length === 0, missing };
  },
};

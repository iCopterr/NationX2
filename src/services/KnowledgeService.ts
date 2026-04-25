// ============================================================
// Knowledge Service — The three core functions of the Knowledge System
//
//   addKnowledge(countryId, type, amount)
//   getKnowledge(countryId)
//   checkKnowledgeRequirement(countryId, requirement)
//
// Everything else (passive XP, research spending) builds on these.
// ============================================================
import {
  KnowledgeModel,
  KnowledgeRow,
  KNOWLEDGE_CONFIG,
  toKnowledgeLevel,
  xpForLevel,
} from '../models/Knowledge';
import { CountryModel } from '../models/Country';
import { PolicyAllocation } from '../models/Policy';
import {
  KnowledgeType,
  KnowledgeRequirement,
  KnowledgeLevel,
  AddKnowledgeResult,
} from '../types';

// ─── Types ───────────────────────────────────────────────────
export interface KnowledgeSnapshot {
  countryId: string;
  domains: KnowledgeLevel[];
  totalLevels: number;
  /** Convenience map for quick lookup: type → level */
  byType: Partial<Record<KnowledgeType, KnowledgeLevel>>;
}

export interface RequirementCheckResult {
  met: boolean;
  missing: Array<{
    type: KnowledgeType;
    label: string;
    required: number;
    current: number;
    deficit: number;
  }>;
  /** Human-readable summary */
  summary: string;
}

export interface ResearchResult {
  type: KnowledgeType;
  moneySpent: number;
  xpGained: number;
  knowledge: AddKnowledgeResult;
}

// ─── Constants ───────────────────────────────────────────────
/** Passive XP gained per tick per 1% of allocation budget */
const XP_PER_ALLOCATION_PCT = 0.5;

// ─── Service ─────────────────────────────────────────────────
export const KnowledgeService = {

  // ══════════════════════════════════════════════════════════
  // 1.  addKnowledge(countryId, type, amount)
  //
  //     Directly adds `amount` XP to the given knowledge type.
  //     Validates the type against the config registry.
  //     Handles level-ups automatically.
  //     Returns a full AddKnowledgeResult.
  // ══════════════════════════════════════════════════════════
  async addKnowledge(
    countryId: string,
    type: KnowledgeType,
    amount: number
  ): Promise<AddKnowledgeResult> {
    if (!KNOWLEDGE_CONFIG[type]) {
      throw new Error(`Unknown knowledge type: "${type}". Valid types: ${Object.keys(KNOWLEDGE_CONFIG).join(', ')}`);
    }
    if (amount <= 0) {
      throw new Error('Knowledge amount must be greater than zero');
    }

    const { result } = await KnowledgeModel.applyXpGain(countryId, type, amount);
    return result;
  },

  // ══════════════════════════════════════════════════════════
  // 2.  getKnowledge(countryId)
  //
  //     Returns a full KnowledgeSnapshot:
  //       - All knowledge domains with level, xp, progress %
  //       - Missing domains are returned at level 0
  //       - Domains are sorted by type name for stable output
  // ══════════════════════════════════════════════════════════
  async getKnowledge(countryId: string): Promise<KnowledgeSnapshot> {
    const rows = await KnowledgeModel.findByCountry(countryId);
    const rowMap = new Map(rows.map((r) => [r.type, r]));

    // Include ALL configured types — missing ones appear at level 0
    const allTypes = Object.keys(KNOWLEDGE_CONFIG) as KnowledgeType[];
    const domains: KnowledgeLevel[] = allTypes.map((type) => {
      const row = rowMap.get(type);
      if (row) return toKnowledgeLevel(row);

      // Virtual row for types that haven't been initialised yet
      const cfg = KNOWLEDGE_CONFIG[type];
      return {
        type,
        level: 0,
        xp: 0,
        xpToNextLevel: xpForLevel(0, type),
        maxLevel: cfg.maxLevel,
        progressPct: 0,
      };
    });

    const byType: Partial<Record<KnowledgeType, KnowledgeLevel>> = {};
    for (const d of domains) byType[d.type] = d;

    return {
      countryId,
      domains,
      totalLevels: domains.reduce((s, d) => s + d.level, 0),
      byType,
    };
  },

  // ══════════════════════════════════════════════════════════
  // 3.  checkKnowledgeRequirement(countryId, requirement)
  //
  //     Checks ONE requirement object: { type, minLevel }
  //     Returns a simple { met: boolean } plus deficit detail.
  //     Cannot use knowledge not owned — level 0 if unresearched.
  //
  //     Also overloaded to check an ARRAY of requirements.
  // ══════════════════════════════════════════════════════════
  async checkKnowledgeRequirement(
    countryId: string,
    requirement: KnowledgeRequirement | KnowledgeRequirement[]
  ): Promise<RequirementCheckResult> {
    const requirements = Array.isArray(requirement) ? requirement : [requirement];

    // Validate all types exist in config first
    for (const req of requirements) {
      if (!KNOWLEDGE_CONFIG[req.type]) {
        throw new Error(`Unknown knowledge type in requirement: "${req.type}"`);
      }
    }

    const { met, missing } = await KnowledgeModel.meetsRequirements(countryId, requirements);

    const enrichedMissing = missing.map((m) => ({
      ...m,
      deficit: m.required - m.current,
    }));

    const summary = met
      ? 'All knowledge requirements are met.'
      : `Missing requirements: ${enrichedMissing
          .map((m) => `${m.label} (need ${m.required}, have ${m.current})`)
          .join('; ')}`;

    return { met, missing: enrichedMissing, summary };
  },

  // ──────────────────────────────────────────────────────────
  // Active Research — Player spends money to gain XP directly.
  // Delegates to addKnowledge internally.
  // ──────────────────────────────────────────────────────────
  async research(
    countryId: string,
    type: KnowledgeType,
    moneyInvestment: number
  ): Promise<ResearchResult> {
    if (moneyInvestment <= 0) throw new Error('Investment must be positive');

    const country = await CountryModel.findById(countryId);
    if (!country) throw new Error('Country not found');
    if (Number(country.money) < moneyInvestment) {
      throw new Error(`Insufficient funds (need ${moneyInvestment}, have ${country.money})`);
    }

    // Deduct cost before awarding XP (fail-fast on insufficient funds)
    await CountryModel.updateMoney(countryId, -moneyInvestment);

    // XP gain uses a square-root curve: expensive research has diminishing returns
    const xpGained = Math.sqrt(moneyInvestment) * 2;
    const knowledge = await KnowledgeService.addKnowledge(countryId, type, xpGained);

    return { type, moneySpent: moneyInvestment, xpGained, knowledge };
  },

  // ──────────────────────────────────────────────────────────
  // Passive Tick XP — Called by the Economy Loop each tick.
  // XP is driven by the country's budget allocation.
  // ──────────────────────────────────────────────────────────
  async gainPassiveXp(
    countryId: string,
    allocation: PolicyAllocation
  ): Promise<Array<{ type: KnowledgeType; xpGained: number }>> {
    const results: Array<{ type: KnowledgeType; xpGained: number }> = [];

    for (const type of Object.keys(KNOWLEDGE_CONFIG) as KnowledgeType[]) {
      const sector = KNOWLEDGE_CONFIG[type].allocationSector as keyof PolicyAllocation;
      const allocationPct = Number(allocation[sector] ?? 0);
      if (allocationPct === 0) continue;

      const xpGained = allocationPct * XP_PER_ALLOCATION_PCT;
      await KnowledgeService.addKnowledge(countryId, type, xpGained);
      results.push({ type, xpGained });
    }

    return results;
  },

  // ──────────────────────────────────────────────────────────
  // Config helpers — expose registry for controllers/docs
  // ──────────────────────────────────────────────────────────
  getConfig() {
    return KNOWLEDGE_CONFIG;
  },

  getValidTypes(): KnowledgeType[] {
    return Object.keys(KNOWLEDGE_CONFIG) as KnowledgeType[];
  },
};

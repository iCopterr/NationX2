// ============================================================
// Resource Service — The three core functions of the Resource System
//
//   produceResource(countryId, type, amount)
//   consumeResource(countryId, type, amount)
//   exploreResource(countryId, type)
//
// All other helpers (tick engine, batch ops) build on these.
// ============================================================
import { ResourceModel, RESOURCE_CONFIG } from '../models/Resource';
import { CountryModel } from '../models/Country';
import { PolicyModel } from '../models/Policy';
import {
  ResourceType,
  ResourceAmount,
  ResourceConfig,
  ProduceResult,
  ConsumeResult,
  ExploreResult,
  ExploreOutcome,
} from '../types';

// ─── Infrastructure multiplier constants ─────────────────────
// Each 1% of 'infrastructure' allocation adds this bonus to production.
const INFRA_PRODUCTION_BONUS_PER_PCT = 0.015; // +1.5% per allocation %

// Exploration risk table — outcomes mapped by riskRoll (0–100)
const EXPLORE_OUTCOMES: Array<{
  maxRoll: number;
  outcome: ExploreOutcome;
  yieldMultiplier: number;
  label: string;
}> = [
  { maxRoll: 5,  outcome: 'dry',     yieldMultiplier: 0,   label: 'The site was completely barren.' },
  { maxRoll: 20, outcome: 'failure', yieldMultiplier: 0.1, label: 'Very little was found — mostly waste.' },
  { maxRoll: 45, outcome: 'partial', yieldMultiplier: 0.5, label: 'A modest deposit was uncovered.' },
  { maxRoll: 80, outcome: 'success', yieldMultiplier: 1.0, label: 'A solid deposit was discovered!' },
  { maxRoll: 95, outcome: 'jackpot', yieldMultiplier: 2.5, label: '🎉 Jackpot! A massive vein was struck!' },
  { maxRoll: 100, outcome: 'jackpot', yieldMultiplier: 3.5, label: '💎 Legendary find — unbelievable reserves!' },
];

// ─── Helpers ─────────────────────────────────────────────────

/** Resolve an outcome from a 0–100 dice roll */
function resolveExploreOutcome(roll: number) {
  return EXPLORE_OUTCOMES.find((o) => roll <= o.maxRoll) ?? EXPLORE_OUTCOMES[EXPLORE_OUTCOMES.length - 1];
}

/** Get infrastructure allocation for a country (0–100) */
async function getInfraAllocation(countryId: string): Promise<number> {
  const alloc = await PolicyModel.getAllocation(countryId);
  return Number(alloc?.infrastructure ?? 0);
}

// ─── Service ─────────────────────────────────────────────────
export const ResourceService = {

  // ══════════════════════════════════════════════════════════
  // 1.  produceResource(countryId, type, amount)
  //
  //     Adds `amount` units of a resource to a country's stock.
  //     Actual yield is scaled by:
  //       - infrastructure allocation bonus  (+1.5% per % allocated)
  //     Amount is capped at capacity (DB enforced).
  //     Returns full ProduceResult with before/after/bonus.
  // ══════════════════════════════════════════════════════════
  async produceResource(
    countryId: string,
    type: ResourceType,
    amount: number
  ): Promise<ProduceResult> {
    if (!RESOURCE_CONFIG[type]) {
      throw new Error(`Unknown resource type: "${type}"`);
    }
    if (amount <= 0) throw new Error('Production amount must be positive');

    // Ensure the resource row exists before adjusting
    await ResourceModel.ensureExists(countryId, type);

    // Infrastructure bonus — production depends on infrastructure
    const infraPct = await getInfraAllocation(countryId);
    const infrastructureBonus = infraPct * INFRA_PRODUCTION_BONUS_PER_PCT;
    const finalAmount = amount * (1 + infrastructureBonus);

    const { before, after } = await ResourceModel.adjust(countryId, type, finalAmount, 'produce');

    return {
      type,
      produced: finalAmount,
      amountBefore: before,
      amountAfter: after,
      infrastructureBonus,
    };
  },

  // ══════════════════════════════════════════════════════════
  // 2.  consumeResource(countryId, type, amount)
  //
  //     Deducts `amount` units from a country's stock.
  //     Partial consumption is allowed — if not enough is stored,
  //     the available amount is consumed and a deficit is reported.
  //     Returns full ConsumeResult including deficit and penalty.
  // ══════════════════════════════════════════════════════════
  async consumeResource(
    countryId: string,
    type: ResourceType,
    amount: number
  ): Promise<ConsumeResult> {
    if (!RESOURCE_CONFIG[type]) {
      throw new Error(`Unknown resource type: "${type}"`);
    }
    if (amount <= 0) throw new Error('Consumption amount must be positive');

    await ResourceModel.ensureExists(countryId, type);

    const available = await ResourceModel.getAmount(countryId, type);
    const consumed = Math.min(available, amount);
    const deficit = amount - consumed;
    const inDeficit = deficit > 0;

    const cfg = RESOURCE_CONFIG[type];
    const happinessPenalty = inDeficit
      ? (deficit / amount) * cfg.deficitHappinessPenalty
      : 0;

    // Deduct what's available (GREATEST(0,...) in DB handles the rest)
    const { before, after } = await ResourceModel.adjust(countryId, type, -amount, 'consume');

    return {
      type,
      requested: amount,
      consumed,
      deficit,
      inDeficit,
      happinessPenalty,
    };
  },

  // ══════════════════════════════════════════════════════════
  // 3.  exploreResource(countryId, type)
  //
  //     Exploration has risk/reward mechanics:
  //       - Costs money (caller passes investment, or uses default)
  //       - Yield = investment × baseYieldPct × outcomeMultiplier
  //       - Outcome is determined by a dice roll (0–100):
  //           5%  → dry      (nothing found, money lost)
  //           15% → failure  (tiny yield, mostly wasted)
  //           25% → partial  (modest find)
  //           35% → success  (solid deposit)
  //           15% → jackpot  (massive find)
  //            5% → legendary jackpot
  //       - Engineering knowledge gives a +roll bonus (up to +10)
  //     Returns full ExploreResult including the roll for transparency.
  // ══════════════════════════════════════════════════════════
  async exploreResource(
    countryId: string,
    type: ResourceType,
    investmentMoney: number = 1000
  ): Promise<ExploreResult> {
    if (!RESOURCE_CONFIG[type]) {
      throw new Error(`Unknown resource type: "${type}"`);
    }
    if (investmentMoney < 100) {
      throw new Error('Minimum exploration investment is 100');
    }

    const country = await CountryModel.findById(countryId);
    if (!country) throw new Error('Country not found');
    if (Number(country.money) < investmentMoney) {
      throw new Error(`Insufficient funds (need ${investmentMoney}, have ${country.money})`);
    }

    // Deduct cost up-front — exploration always costs money
    await CountryModel.updateMoney(countryId, -investmentMoney);

    // Roll: 0–100 raw, then apply engineering knowledge bonus
    const baseRoll = Math.random() * 100;

    // Engineering knowledge gives a roll bonus (max +10 at level 100)
    const knowledgeRows = await import('../models/Knowledge').then((m) =>
      m.KnowledgeModel.findOne(countryId, 'engineering')
    );
    const engLevel = Number(knowledgeRows?.level ?? 0);
    const rollBonus = (engLevel / 100) * 10;          // 0 → +10 bonus
    const finalRoll = Math.min(100, baseRoll + rollBonus);

    const outcomeEntry = resolveExploreOutcome(finalRoll);
    const cfg = RESOURCE_CONFIG[type];
    const baseYield = investmentMoney * cfg.exploreBaseYieldPct;
    const discovered = Math.floor(baseYield * outcomeEntry.yieldMultiplier);

    // Ensure row exists and credit the yield
    await ResourceModel.ensureExists(countryId, type);
    let amountAfter = 0;
    if (discovered > 0) {
      const { after } = await ResourceModel.adjust(countryId, type, discovered, 'explore');
      amountAfter = after;
    } else {
      amountAfter = await ResourceModel.getAmount(countryId, type);
    }

    return {
      type,
      outcome: outcomeEntry.outcome,
      investment: investmentMoney,
      discovered,
      amountAfter,
      riskRoll: Math.round(finalRoll),
      message: outcomeEntry.label,
    };
  },

  // ──────────────────────────────────────────────────────────
  // getResources — full snapshot for a country
  // ──────────────────────────────────────────────────────────
  async getResources(countryId: string) {
    const rows = await ResourceModel.findByCountry(countryId);
    const allTypes = Object.keys(RESOURCE_CONFIG) as ResourceType[];

    // Build a map for fast lookup
    const rowMap = new Map(rows.map((r) => [r.type, r]));

    // Return ALL configured types, even if not yet initialised
    return allTypes.map((type) => {
      const row = rowMap.get(type);
      const cfg = RESOURCE_CONFIG[type];
      return {
        type,
        label: cfg.label,
        description: cfg.description,
        amount: row ? Number(row.amount) : 0,
        capacity: row ? Number(row.capacity) : cfg.defaultCapacity,
        perTick: row ? Number(row.per_tick) : 0,
        fillPct: row ? Math.round((Number(row.amount) / Number(row.capacity)) * 100) : 0,
      };
    });
  },

  // ──────────────────────────────────────────────────────────
  // Audit log — resource history for a country
  // ──────────────────────────────────────────────────────────
  async getLogs(countryId: string, type?: ResourceType, limit = 50) {
    return ResourceModel.getLogs(countryId, type, limit);
  },

  // ──────────────────────────────────────────────────────────
  // Config helpers
  // ──────────────────────────────────────────────────────────
  getConfig(): Record<ResourceType, ResourceConfig> {
    return RESOURCE_CONFIG;
  },

  getValidTypes(): ResourceType[] {
    return Object.keys(RESOURCE_CONFIG) as ResourceType[];
  },

  // ──────────────────────────────────────────────────────────
  // Economy loop helpers — called by EconomyLoopService each tick
  // ──────────────────────────────────────────────────────────

  /** Tick-based production for all resource types using config rates */
  async produceTick(
    countryId: string,
    policyMultipliers: Partial<Record<ResourceType, number>> = {}
  ): Promise<ProduceResult[]> {
    const results: ProduceResult[] = [];
    for (const type of Object.keys(RESOURCE_CONFIG) as ResourceType[]) {
      const base = RESOURCE_CONFIG[type].baseProduction;
      const policyMult = policyMultipliers[type] ?? 1.0;
      const result = await ResourceService.produceResource(countryId, type, base * policyMult);
      results.push(result);
    }
    return results;
  },

  /** Tick-based consumption for all resource types using config rates */
  async consumeTick(
    countryId: string,
    policyMultipliers: Partial<Record<ResourceType, number>> = {}
  ): Promise<{ results: ConsumeResult[]; deficits: ResourceType[]; totalPenalty: number }> {
    const results: ConsumeResult[] = [];
    const deficits: ResourceType[] = [];
    let totalPenalty = 0;

    for (const type of Object.keys(RESOURCE_CONFIG) as ResourceType[]) {
      const base = RESOURCE_CONFIG[type].baseConsumption;
      if (base === 0) continue;
      const policyMult = policyMultipliers[type] ?? 1.0;
      const result = await ResourceService.consumeResource(countryId, type, base * policyMult);
      results.push(result);
      if (result.inDeficit) {
        deficits.push(type);
        totalPenalty += result.happinessPenalty;
      }
    }

    return { results, deficits, totalPenalty };
  },

  /** Deduct an exact list of resources — validates all before deducting any */
  async deductResources(countryId: string, costs: ResourceAmount[]): Promise<void> {
    for (const cost of costs) {
      const has = await ResourceModel.hasSufficient(countryId, cost.type, cost.amount);
      if (!has) {
        const have = await ResourceModel.getAmount(countryId, cost.type);
        throw new Error(
          `Insufficient ${RESOURCE_CONFIG[cost.type].label}: need ${cost.amount}, have ${have.toFixed(2)}`
        );
      }
    }
    for (const cost of costs) {
      await ResourceModel.adjust(countryId, cost.type, -cost.amount, 'trade');
    }
  },

  /** Add a list of output resources */
  async addResources(countryId: string, outputs: ResourceAmount[]): Promise<void> {
    for (const out of outputs) {
      await ResourceModel.ensureExists(countryId, out.type);
      await ResourceModel.adjust(countryId, out.type, out.amount, 'produce');
    }
  },
};

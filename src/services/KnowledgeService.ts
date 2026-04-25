// ============================================================
// Knowledge Service
// ============================================================
import { KnowledgeModel } from '../models/Knowledge';
import { CountryModel } from '../models/Country';
import { KnowledgeType, KnowledgeRequirement } from '../types';
import { PolicyAllocation } from '../models/Policy';

/** XP per tick per 1% allocation */
const XP_PER_ALLOCATION_PERCENT = 0.5;

/** Maps knowledge type to the policy sector that boosts it */
const ALLOCATION_MAP: Partial<Record<KnowledgeType, keyof PolicyAllocation>> = {
  technology: 'technology',
  military: 'military',
  science: 'education',
  economics: 'economy',
  medicine: 'healthcare',
  engineering: 'infrastructure',
};

export const KnowledgeService = {
  async getKnowledge(countryId: string) {
    return KnowledgeModel.findByCountry(countryId);
  },

  async getKnowledgeByType(countryId: string, type: KnowledgeType) {
    return KnowledgeModel.findOne(countryId, type);
  },

  /**
   * Spend money to research a knowledge type.
   * More money = more XP, but with diminishing returns.
   */
  async research(countryId: string, type: KnowledgeType, moneyInvestment: number) {
    if (moneyInvestment <= 0) throw new Error('Investment must be positive');

    const country = await CountryModel.findById(countryId);
    if (!country) throw new Error('Country not found');
    if (country.money < moneyInvestment) throw new Error('Insufficient funds');

    // Deduct cost
    await CountryModel.updateMoney(countryId, -moneyInvestment);

    // XP gain: sqrt curve for diminishing returns
    const xpGain = Math.sqrt(moneyInvestment) * 2;
    const updated = await KnowledgeModel.addXp(countryId, type, xpGain);

    return { type, xpGained: xpGain, moneySpent: moneyInvestment, knowledge: updated };
  },

  /**
   * Passive XP gain per tick, driven by policy allocation.
   */
  async gainPassiveXp(countryId: string, allocation: PolicyAllocation) {
    const allTypes: KnowledgeType[] = ['technology', 'military', 'engineering', 'science', 'economics', 'medicine'];
    const results: Array<{ type: KnowledgeType; xp: number }> = [];

    for (const type of allTypes) {
      const sector = ALLOCATION_MAP[type];
      if (!sector) continue;
      const allocationPct = (allocation[sector] as number) ?? 0;
      if (allocationPct === 0) continue;

      const xp = allocationPct * XP_PER_ALLOCATION_PERCENT;
      await KnowledgeModel.addXp(countryId, type, xp);
      results.push({ type, xp });
    }

    return results;
  },

  async checkRequirements(countryId: string, requirements: KnowledgeRequirement[]) {
    return KnowledgeModel.meetsRequirements(countryId, requirements);
  },
};

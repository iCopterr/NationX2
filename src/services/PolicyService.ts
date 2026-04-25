// ============================================================
// Policy Service
// ============================================================
import { PolicyModel, Policy, UpdateAllocationDto } from '../models/Policy';
import { CountryModel } from '../models/Country';
import { PolicySector } from '../types';

/** Built-in policy catalog — expandable via DB or config */
export const POLICY_CATALOG: Array<Omit<Policy, 'id' | 'country_id' | 'is_active' | 'enacted_at' | 'expires_at' | 'created_at'>> = [
  {
    name: 'Free Trade Zone',
    description: 'Remove tariffs and open borders to trade, boosting income but reducing military funds.',
    sector: 'economy',
    cost_money: 5000,
    cost_per_tick: 100,
    effects: { income: 1.2, military: 0.9 },
  },
  {
    name: 'Universal Healthcare',
    description: 'Provide free healthcare, increasing happiness but costing heavily per tick.',
    sector: 'healthcare',
    cost_money: 8000,
    cost_per_tick: 500,
    effects: { happiness: 1.3, income: 0.95 },
  },
  {
    name: 'Mandatory Military Service',
    description: 'All citizens serve military — boosts military knowledge but reduces happiness.',
    sector: 'military',
    cost_money: 3000,
    cost_per_tick: 200,
    effects: { military_knowledge_xp: 1.5, happiness: 0.85 },
  },
  {
    name: 'Innovation Drive',
    description: 'Government subsidizes R&D, accelerating technology growth.',
    sector: 'technology',
    cost_money: 6000,
    cost_per_tick: 300,
    effects: { tech_xp: 2.0, science_xp: 1.5 },
  },
  {
    name: 'Austerity Measures',
    description: 'Cut spending across all sectors. Saves money but reduces all output.',
    sector: 'economy',
    cost_money: 0,
    cost_per_tick: -1000, // negative = saves money
    effects: { income: 1.1, happiness: 0.7, growth: 0.8 },
  },
  {
    name: 'Agricultural Subsidies',
    description: 'Boost food production rates.',
    sector: 'economy',
    cost_money: 2000,
    cost_per_tick: 150,
    effects: { food_production: 1.5 },
  },
  {
    name: 'Energy Independence',
    description: 'Invest in energy infrastructure for self-sufficiency.',
    sector: 'infrastructure',
    cost_money: 10000,
    cost_per_tick: 400,
    effects: { energy_production: 1.8, oil_consumption: 0.6 },
  },
];

export const PolicyService = {
  async getPolicies(countryId: string) {
    return PolicyModel.findByCountry(countryId);
  },

  async getActivePolicies(countryId: string) {
    return PolicyModel.findActiveByCountry(countryId);
  },

  /** Propose a policy from the built-in catalog */
  async proposePolicy(countryId: string, catalogIndex: number): Promise<Policy> {
    const template = POLICY_CATALOG[catalogIndex];
    if (!template) throw new Error('Policy not found in catalog');

    return PolicyModel.create({
      country_id: countryId,
      ...template,
    });
  },

  /** Enact a proposed policy — deducts upfront cost */
  async enactPolicy(countryId: string, policyId: string): Promise<Policy> {
    const policy = await PolicyModel.findById(policyId);
    if (!policy) throw new Error('Policy not found');
    if (policy.country_id !== countryId) throw new Error('Not your policy');
    if (policy.is_active) throw new Error('Policy already active');

    const country = await CountryModel.findById(countryId);
    if (!country) throw new Error('Country not found');
    if (country.money < policy.cost_money) {
      throw new Error(`Insufficient funds (need ${policy.cost_money}, have ${country.money})`);
    }

    // Deduct upfront cost
    await CountryModel.updateMoney(countryId, -policy.cost_money);
    const enacted = await PolicyModel.enact(policyId, countryId);
    if (!enacted) throw new Error('Failed to enact policy');
    return enacted;
  },

  /** Repeal a policy */
  async repealPolicy(countryId: string, policyId: string): Promise<Policy> {
    const policy = await PolicyModel.findById(policyId);
    if (!policy) throw new Error('Policy not found');
    if (policy.country_id !== countryId) throw new Error('Not your policy');
    if (!policy.is_active) throw new Error('Policy not active');

    const repealed = await PolicyModel.repeal(policyId, countryId);
    if (!repealed) throw new Error('Failed to repeal');
    return repealed;
  },

  /** Update budget allocation */
  async updateAllocation(countryId: string, dto: UpdateAllocationDto) {
    return PolicyModel.upsertAllocation(countryId, dto);
  },

  /** Get the effect multipliers from active policies for the economy tick */
  async getEffectMultipliers(countryId: string): Promise<Record<string, number>> {
    const active = await PolicyModel.findActiveByCountry(countryId);
    const combined: Record<string, number> = {};

    for (const policy of active) {
      for (const [key, val] of Object.entries(policy.effects)) {
        combined[key] = (combined[key] ?? 1.0) * (val as number);
      }
    }

    return combined;
  },

  /** Deduct per-tick policy costs, returns total cost */
  async deductPolicyCosts(countryId: string): Promise<number> {
    const active = await PolicyModel.findActiveByCountry(countryId);
    const totalPerTick = active.reduce((sum, p) => sum + Number(p.cost_per_tick), 0);
    if (totalPerTick > 0) {
      await CountryModel.updateMoney(countryId, -totalPerTick);
    } else if (totalPerTick < 0) {
      // Austerity saves money
      await CountryModel.updateMoney(countryId, Math.abs(totalPerTick));
    }
    return totalPerTick;
  },

  getCatalog() {
    return POLICY_CATALOG.map((p, i) => ({ ...p, catalogIndex: i }));
  },
};

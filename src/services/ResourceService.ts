// ============================================================
// Resource Service
// ============================================================
import { ResourceModel } from '../models/Resource';
import { CountryModel } from '../models/Country';
import { ResourceType, ResourceAmount } from '../types';

/** Base production rates per tick, before policy modifiers */
const BASE_PRODUCTION: Record<ResourceType, number> = {
  metal: 10,
  energy: 15,
  food: 20,
  oil: 5,
  water: 25,
  rare_earth: 2,
};

/** Base consumption rates per tick */
const BASE_CONSUMPTION: Record<ResourceType, number> = {
  metal: 3,
  energy: 10,
  food: 12,
  oil: 3,
  water: 8,
  rare_earth: 0,
};

export const ResourceService = {
  /** Get all resources for a country */
  async getResources(countryId: string) {
    return ResourceModel.findByCountry(countryId);
  },

  /**
   * Explore for a resource — costs money and time, yields RNG amount.
   * Higher exploration level → better yields.
   */
  async exploreResource(countryId: string, type: ResourceType, investmentMoney: number) {
    if (investmentMoney <= 0) throw new Error('Investment must be positive');

    const country = await CountryModel.findById(countryId);
    if (!country) throw new Error('Country not found');
    if (country.money < investmentMoney) throw new Error('Insufficient funds');

    // Deduct cost
    await CountryModel.updateMoney(countryId, -investmentMoney);

    // Yield based on investment (with noise)
    const baseYield = investmentMoney * 0.05;
    const randomMultiplier = 0.5 + Math.random() * 1.5;
    const discovered = Math.floor(baseYield * randomMultiplier);

    // Ensure resource row exists
    await ResourceModel.upsert(countryId, type);
    await ResourceModel.adjust(countryId, type, discovered);

    return { type, discovered, investmentMoney };
  },

  /**
   * Produce resources for a country for one tick.
   * Rate is base + policy multiplier.
   */
  async produceTick(countryId: string, multipliers: Partial<Record<ResourceType, number>> = {}) {
    const results: Array<{ type: ResourceType; produced: number }> = [];
    for (const [rawType, base] of Object.entries(BASE_PRODUCTION)) {
      const type = rawType as ResourceType;
      const mult = multipliers[type] ?? 1.0;
      const produced = base * mult;
      await ResourceModel.adjust(countryId, type, produced);
      results.push({ type, produced });
    }
    return results;
  },

  /**
   * Consume resources for one tick (population needs, infrastructure, etc.)
   */
  async consumeTick(countryId: string, multipliers: Partial<Record<ResourceType, number>> = {}) {
    const deficits: ResourceType[] = [];
    for (const [rawType, base] of Object.entries(BASE_CONSUMPTION)) {
      const type = rawType as ResourceType;
      const mult = multipliers[type] ?? 1.0;
      const needed = base * mult;
      const hasSufficient = await ResourceModel.hasSufficient(countryId, type, needed);
      if (!hasSufficient) deficits.push(type);
      await ResourceModel.adjust(countryId, type, -needed);
    }
    return { deficits };
  },

  /**
   * Deduct a list of resources, atomically checking all before deducting.
   */
  async deductResources(countryId: string, costs: ResourceAmount[]): Promise<void> {
    // Validate all first
    for (const cost of costs) {
      const has = await ResourceModel.hasSufficient(countryId, cost.type, cost.amount);
      if (!has) throw new Error(`Insufficient ${cost.type} (need ${cost.amount})`);
    }
    // Deduct all
    for (const cost of costs) {
      await ResourceModel.adjust(countryId, cost.type, -cost.amount);
    }
  },

  /**
   * Add a list of resources (production output).
   */
  async addResources(countryId: string, outputs: ResourceAmount[]): Promise<void> {
    for (const out of outputs) {
      await ResourceModel.upsert(countryId, out.type);
      await ResourceModel.adjust(countryId, out.type, out.amount);
    }
  },
};

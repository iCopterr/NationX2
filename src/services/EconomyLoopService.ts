// ============================================================
// Economy Loop Service — The Heart of NationX
// ============================================================
// Each "tick" runs for every active country and:
// 1. Collects tax revenue
// 2. Deducts policy costs
// 3. Produces / consumes resources (with policy multipliers)
// 4. Gains passive knowledge XP from allocation
// 5. Processes completed production orders
// 6. Updates GDP, growth, happiness, unemployment
// 7. Logs the tick to economy_ticks for auditing
// ============================================================
import { CountryModel } from '../models/Country';
import { PolicyModel } from '../models/Policy';
import { ResourceService } from './ResourceService';
import { KnowledgeService } from './KnowledgeService';
import { PolicyService } from './PolicyService';
import { ProductionService } from './ProductionService';
import { MarketService } from './MarketService';
import { query, queryOne } from '../database/pool';
import { ResourceType } from '../types';
import { config } from '../config';

/** How much of GDP is converted to income per tick */
const GDP_INCOME_RATIO = 0.001;

/** Base happiness recovery rate per tick */
const HAPPINESS_RECOVERY = 0.1;

export const EconomyLoopService = {
  /** Increment tick counter and return new tick number */
  async incrementTick(): Promise<number> {
    const row = await queryOne<{ value: string }>(
      `UPDATE tick_counter SET value = value + 1 WHERE id = 1 RETURNING value`
    );
    return parseInt(row?.value ?? '1', 10);
  },

  /** Run economy tick for a single country */
  async runForCountry(countryId: string, tickNumber: number) {
    const country = await CountryModel.findById(countryId);
    if (!country || !country.is_active) return null;

    const moneyBefore = Number(country.money);
    let income = 0;
    let expenditure = 0;
    let happinessDelta = 0;

    // ── Step 1: Tax Revenue ─────────────────────────────────────
    const taxRevenue = (country.population * country.tax_rate) / 1000;
    await CountryModel.updateMoney(countryId, taxRevenue);
    income += taxRevenue;

    // ── Step 2: Policy per-tick costs ───────────────────────────
    const policyCost = await PolicyService.deductPolicyCosts(countryId);
    expenditure += Math.max(0, policyCost);

    // ── Step 3: Policy effect multipliers ───────────────────────
    const effects = await PolicyService.getEffectMultipliers(countryId);
    const allocation = await PolicyModel.getAllocation(countryId);

    // Resource multipliers from policies
    const resourceMults: Partial<Record<ResourceType, number>> = {
      food: effects['food_production'] ?? 1.0,
      energy: effects['energy_production'] ?? 1.0,
    };

    // ── Step 4: Resource production & consumption ───────────────
    await ResourceService.produceTick(countryId, resourceMults);
    const { deficits, totalPenalty } = await ResourceService.consumeTick(countryId);

    // Apply deficit happiness penalty from resource service (already config-driven)
    happinessDelta -= totalPenalty;

    // ── Step 5: Passive knowledge XP ────────────────────────────
    if (allocation) {
      await KnowledgeService.gainPassiveXp(countryId, allocation);
      // Education allocation boosts happiness
      happinessDelta += (Number(allocation.education) * 0.05);
    }

    // ── Step 6: Process completed production ─────────────────────
    await ProductionService.processCompletedOrders(countryId);

    // ── Step 7: GDP calculation ─────────────────────────────────
    // GDP = tax + market activity + production value
    const gdpGrowth = income * (effects['growth'] ?? 1.0);
    const newGdp = Number(country.gdp) + gdpGrowth;

    // Passive income from GDP
    const gdpIncome = newGdp * GDP_INCOME_RATIO;
    await CountryModel.updateMoney(countryId, gdpIncome);
    income += gdpIncome;

    // ── Step 8: Happiness calculation ───────────────────────────
    const policyHappinessMult = effects['happiness'] ?? 1.0;
    happinessDelta += HAPPINESS_RECOVERY * (policyHappinessMult - 1);
    happinessDelta = Math.max(-10, Math.min(10, happinessDelta));

    const currentHappiness = Number(country.happiness);
    const newHappiness = Math.max(0, Math.min(100, currentHappiness + happinessDelta));

    // ── Step 9: Unemployment (inverse of tech + economy allocation)
    const techAlloc = Number(allocation?.technology ?? 0);
    const econAlloc = Number(allocation?.economy ?? 0);
    const newUnemployment = Math.max(1, Number(country.unemployment) - (techAlloc + econAlloc) * 0.01);

    // ── Step 10: Update country stats ───────────────────────────
    await CountryModel.updateStats(countryId, {
      gdp: newGdp,
      happiness: newHappiness,
      unemployment: newUnemployment,
      growth_rate: Math.min(20, Math.max(-10, (gdpIncome / Math.max(1, newGdp)) * 100)),
    });

    const updatedCountry = await CountryModel.findById(countryId);
    const moneyAfter = Number(updatedCountry?.money ?? moneyBefore);

    // ── Step 11: Log tick ───────────────────────────────────────
    await query(
      `INSERT INTO economy_ticks
         (country_id, tick_number, money_before, money_after, income, expenditure, gdp_delta, happiness_delta, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        countryId, tickNumber, moneyBefore, moneyAfter,
        income, expenditure, gdpGrowth, happinessDelta,
        JSON.stringify({ deficits, policyEffects: effects }),
      ]
    );

    return {
      countryId,
      tickNumber,
      moneyBefore,
      moneyAfter,
      income,
      expenditure,
      gdpDelta: gdpGrowth,
      happinessDelta,
      deficits,
    };
  },

  /** Run economy tick for ALL active countries */
  async runGlobalTick() {
    const tickNumber = await EconomyLoopService.incrementTick();
    console.log(`\n[Economy] ═══ TICK #${tickNumber} ═══`);

    const countries = await CountryModel.findAll(1000, 0);
    const results = [];

    for (const country of countries) {
      try {
        const result = await EconomyLoopService.runForCountry(country.id, tickNumber);
        if (result) results.push(result);
      } catch (err) {
        console.error(`[Economy] Error for country ${country.id}:`, err);
      }
    }

    // Expire market listings
    const expired = await MarketService.cleanupExpired();
    if (expired > 0) console.log(`[Economy] Expired ${expired} market listings`);

    console.log(`[Economy] Tick #${tickNumber} complete — ${results.length} countries processed.`);
    return { tickNumber, countriesProcessed: results.length, results };
  },

  /** Start the auto-tick scheduler */
  startScheduler() {
    const interval = config.game.tickIntervalMs;
    console.log(`[Economy] Scheduler started — tick every ${interval}ms`);
    setInterval(async () => {
      try {
        await EconomyLoopService.runGlobalTick();
      } catch (err) {
        console.error('[Economy] Tick failed:', err);
      }
    }, interval);
  },
};

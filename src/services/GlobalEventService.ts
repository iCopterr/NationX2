// ============================================================
// Global Event Service
// ============================================================
import { GlobalEventModel, GlobalEvent } from '../models/GlobalEvent';
import { CountryModel } from '../models/Country';
import { ResourceModel } from '../models/Resource';
import { EventType, EventSeverity } from '../types';

/** Pre-defined event templates */
const EVENT_TEMPLATES: Array<Omit<GlobalEvent, 'id' | 'status' | 'started_at' | 'resolved_at' | 'affected_countries'>> = [
  {
    type: 'flood',
    title: 'Catastrophic Flooding',
    description: 'Major floods have struck multiple regions, destroying farmland and infrastructure.',
    severity: 'high',
    effects: { food: -30, happiness: -10, infrastructure_damage: 0.2 },
    ends_at: null,
  },
  {
    type: 'recession',
    title: 'Global Recession',
    description: 'The world economy has entered a downturn. Trade volumes are falling.',
    severity: 'medium',
    effects: { income: -0.2, market_tax: 1.3 },
    ends_at: null,
  },
  {
    type: 'trade_boom',
    title: 'Global Trade Boom',
    description: 'International trade is booming! Market activity is up significantly.',
    severity: 'low',
    effects: { market_multiplier: 1.5, income: 1.1 },
    ends_at: null,
  },
  {
    type: 'pandemic',
    title: 'Global Pandemic',
    description: 'A deadly disease is spreading globally, reducing workforce productivity.',
    severity: 'catastrophic',
    effects: { happiness: -20, food_consumption: 1.2, income: -0.3 },
    ends_at: null,
  },
  {
    type: 'technological_breakthrough',
    title: 'Technological Breakthrough',
    description: 'A major scientific discovery has been shared globally. All nations gain knowledge.',
    severity: 'low',
    effects: { tech_xp_bonus: 500, science_xp_bonus: 300 },
    ends_at: null,
  },
  {
    type: 'war',
    title: 'Regional Conflict',
    description: 'Conflict has broken out in a region, disrupting trade and causing instability.',
    severity: 'high',
    effects: { metal: -20, oil: -15, military_demand: 1.5, happiness: -15 },
    ends_at: null,
  },
];

export const GlobalEventService = {
  async getActiveEvents() {
    return GlobalEventModel.findActive();
  },

  async getEventById(id: string) {
    return GlobalEventModel.findById(id);
  },

  /** Trigger a random event (called by game scheduler) */
  async triggerRandomEvent(): Promise<GlobalEvent | null> {
    // Only trigger with 20% probability per scheduled call
    if (Math.random() > 0.2) return null;

    const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
    const allCountries = await CountryModel.findAll(1000, 0);
    const affectedCount = Math.max(1, Math.floor(allCountries.length * 0.5));
    const shuffled = allCountries.sort(() => 0.5 - Math.random());
    const affected = shuffled.slice(0, affectedCount).map((c) => c.id);

    // Set end time 3-10 ticks from now (in minutes based on tick interval)
    const endsInMs = (3 + Math.floor(Math.random() * 7)) * 60 * 1000; // 3-10 min
    const ends_at = new Date(Date.now() + endsInMs);

    const event = await GlobalEventModel.create({
      ...template,
      affected_countries: affected,
      ends_at,
    });

    // Apply immediate effects to affected countries
    await GlobalEventService.applyEventEffects(event, affected);

    return event;
  },

  /** Apply event effects to specific countries */
  async applyEventEffects(event: GlobalEvent, countryIds: string[]) {
    const fx = event.effects as Record<string, number>;
    for (const countryId of countryIds) {
      try {
        // Resource impacts
        if (fx.food) await ResourceModel.adjust(countryId, 'food', fx.food);
        if (fx.metal) await ResourceModel.adjust(countryId, 'metal', fx.metal);
        if (fx.oil) await ResourceModel.adjust(countryId, 'oil', fx.oil);

        // Happiness impact
        if (fx.happiness) {
          const country = await CountryModel.findById(countryId);
          if (country) {
            await CountryModel.updateStats(countryId, {
              happiness: Math.max(0, Math.min(100, country.happiness + fx.happiness)),
            });
          }
        }
      } catch (err) {
        console.error(`[Events] Failed to apply effects to ${countryId}:`, err);
      }
    }
  },

  /** Record a country's response to an event */
  async respondToEvent(countryId: string, eventId: string, response: string) {
    const event = await GlobalEventModel.findById(eventId);
    if (!event) throw new Error('Event not found');
    if (event.status !== 'active') throw new Error('Event is no longer active');

    const validResponses = ['accept', 'reject', 'negotiate', 'observe'];
    if (!validResponses.includes(response)) throw new Error(`Invalid response. Must be: ${validResponses.join(', ')}`);

    // Different responses have different costs/benefits
    if (response === 'accept') {
      // Mitigate some negative effects
      await CountryModel.updateMoney(countryId, -1000); // Contribution
    }

    return GlobalEventModel.recordResponse(countryId, eventId, response);
  },

  /** Expire old events */
  async cleanupExpiredEvents() {
    return GlobalEventModel.expireOld();
  },
};

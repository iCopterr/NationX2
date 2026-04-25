// ============================================================
// Global Event Model
// ============================================================
import { query, queryOne } from '../database/pool';
import { EventType, EventSeverity, EventStatus } from '../types';

export interface GlobalEvent {
  id: string;
  type: EventType;
  title: string;
  description: string;
  severity: EventSeverity;
  effects: Record<string, unknown>;
  affected_countries: string[];
  status: EventStatus;
  started_at: Date;
  ends_at: Date | null;
  resolved_at: Date | null;
}

export interface CountryEventResponse {
  id: string;
  country_id: string;
  event_id: string;
  response: string;
  responded_at: Date;
}

export const GlobalEventModel = {
  async findActive(): Promise<GlobalEvent[]> {
    return query<GlobalEvent>(
      `SELECT * FROM global_events WHERE status = 'active' ORDER BY started_at DESC`
    );
  },

  async findById(id: string): Promise<GlobalEvent | null> {
    return queryOne<GlobalEvent>('SELECT * FROM global_events WHERE id = $1', [id]);
  },

  async create(data: Omit<GlobalEvent, 'id' | 'status' | 'started_at' | 'resolved_at'>): Promise<GlobalEvent> {
    const row = await queryOne<GlobalEvent>(
      `INSERT INTO global_events (type, title, description, severity, effects, affected_countries, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        data.type, data.title, data.description, data.severity,
        JSON.stringify(data.effects),
        JSON.stringify(data.affected_countries),
        data.ends_at ?? null,
      ]
    );
    if (!row) throw new Error('Failed to create event');
    return row;
  },

  async resolve(id: string): Promise<GlobalEvent | null> {
    return queryOne<GlobalEvent>(
      `UPDATE global_events SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
  },

  async expireOld(): Promise<number> {
    const rows = await query<{ id: string }>(
      `UPDATE global_events SET status = 'expired'
       WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= NOW()
       RETURNING id`
    );
    return rows.length;
  },

  async recordResponse(countryId: string, eventId: string, response: string): Promise<CountryEventResponse> {
    const row = await queryOne<CountryEventResponse>(
      `INSERT INTO country_event_responses (country_id, event_id, response)
       VALUES ($1,$2,$3)
       ON CONFLICT (country_id, event_id) DO UPDATE SET response = $3, responded_at = NOW()
       RETURNING *`,
      [countryId, eventId, response]
    );
    if (!row) throw new Error('Failed to record response');
    return row;
  },

  async getResponse(countryId: string, eventId: string): Promise<CountryEventResponse | null> {
    return queryOne<CountryEventResponse>(
      'SELECT * FROM country_event_responses WHERE country_id = $1 AND event_id = $2',
      [countryId, eventId]
    );
  },
};

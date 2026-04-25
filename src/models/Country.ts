// ============================================================
// Country Model — DB row types + helpers
// ============================================================
import { query, queryOne } from '../database/pool';

export interface Country {
  id: string;
  user_id: string;
  name: string;
  flag_emoji: string;
  money: number;
  population: number;
  happiness: number;
  gdp: number;
  tax_rate: number;
  growth_rate: number;
  inflation_rate: number;
  unemployment: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCountryDto {
  userId: string;
  name: string;
  flagEmoji?: string;
}

export const CountryModel = {
  async findById(id: string): Promise<Country | null> {
    return queryOne<Country>('SELECT * FROM countries WHERE id = $1', [id]);
  },

  async findByUserId(userId: string): Promise<Country | null> {
    return queryOne<Country>('SELECT * FROM countries WHERE user_id = $1', [userId]);
  },

  async findAll(limit = 50, offset = 0): Promise<Country[]> {
    return query<Country>(
      'SELECT * FROM countries WHERE is_active = TRUE ORDER BY gdp DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
  },

  async create(dto: CreateCountryDto): Promise<Country> {
    const row = await queryOne<Country>(
      `INSERT INTO countries (user_id, name, flag_emoji)
       VALUES ($1, $2, $3) RETURNING *`,
      [dto.userId, dto.name, dto.flagEmoji ?? '🏳']
    );
    if (!row) throw new Error('Failed to create country');
    return row;
  },

  async updateMoney(id: string, delta: number): Promise<Country | null> {
    return queryOne<Country>(
      `UPDATE countries SET money = money + $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, delta]
    );
  },

  async updateStats(
    id: string,
    fields: Partial<Pick<Country, 'happiness' | 'gdp' | 'growth_rate' | 'inflation_rate' | 'unemployment' | 'population'>>
  ): Promise<Country | null> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    let i = 2;
    for (const [key, val] of Object.entries(fields)) {
      sets.push(`${key} = $${i++}`);
      values.push(val);
    }
    if (sets.length === 0) return CountryModel.findById(id);
    return queryOne<Country>(
      `UPDATE countries SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values
    );
  },

  async count(): Promise<number> {
    const row = await queryOne<{ count: string }>('SELECT COUNT(*) FROM countries WHERE is_active = TRUE');
    return parseInt(row?.count ?? '0', 10);
  },
};

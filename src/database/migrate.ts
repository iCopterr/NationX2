import { query } from './pool';

/**
 * Full PostgreSQL schema for NationX.
 * Run with: npm run db:migrate
 */
export async function migrate(): Promise<void> {
  console.log('[DB] Running migrations...');

  // ── Users & Countries ────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username    VARCHAR(64) UNIQUE NOT NULL,
      email       VARCHAR(255) UNIQUE NOT NULL,
      password    VARCHAR(255) NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS countries (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name            VARCHAR(128) NOT NULL,
      flag_emoji      VARCHAR(8) DEFAULT '🏳',
      money           NUMERIC(20,2) DEFAULT 10000,
      population      BIGINT DEFAULT 1000000,
      happiness       NUMERIC(5,2) DEFAULT 50.00,
      gdp             NUMERIC(20,2) DEFAULT 0,
      tax_rate        NUMERIC(5,2) DEFAULT 15.00,
      growth_rate     NUMERIC(5,2) DEFAULT 1.00,
      inflation_rate  NUMERIC(5,2) DEFAULT 2.00,
      unemployment    NUMERIC(5,2) DEFAULT 5.00,
      is_active       BOOLEAN DEFAULT TRUE,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Resources ────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS resources (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      country_id  UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      type        VARCHAR(32) NOT NULL,
      amount      NUMERIC(20,4) DEFAULT 0,
      capacity    NUMERIC(20,4) DEFAULT 100000,
      per_tick    NUMERIC(10,4) DEFAULT 0,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(country_id, type)
    );
  `);

  // ── Knowledge ────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS knowledge (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      country_id  UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      type        VARCHAR(32) NOT NULL,
      level       NUMERIC(10,2) DEFAULT 0,
      max_level   NUMERIC(10,2) DEFAULT 100,
      xp          NUMERIC(20,4) DEFAULT 0,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(country_id, type)
    );
  `);

  // ── Policies ─────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS policies (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      country_id    UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      name          VARCHAR(128) NOT NULL,
      description   TEXT,
      sector        VARCHAR(32) NOT NULL,
      cost_money    NUMERIC(20,2) DEFAULT 0,
      cost_per_tick NUMERIC(20,2) DEFAULT 0,
      effects       JSONB DEFAULT '{}',
      is_active     BOOLEAN DEFAULT FALSE,
      enacted_at    TIMESTAMPTZ,
      expires_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS policy_allocations (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      country_id    UUID UNIQUE NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      education     NUMERIC(5,2) DEFAULT 0,
      military      NUMERIC(5,2) DEFAULT 0,
      technology    NUMERIC(5,2) DEFAULT 0,
      economy       NUMERIC(5,2) DEFAULT 0,
      healthcare    NUMERIC(5,2) DEFAULT 0,
      infrastructure NUMERIC(5,2) DEFAULT 0,
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT total_allocation CHECK (
        education + military + technology + economy + healthcare + infrastructure <= 100
      )
    );
  `);

  // ── Production ───────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS item_recipes (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name              VARCHAR(128) UNIQUE NOT NULL,
      description       TEXT,
      category          VARCHAR(64) NOT NULL DEFAULT 'materials',
      input_resources   JSONB NOT NULL DEFAULT '[]',
      output_resources  JSONB NOT NULL DEFAULT '[]',
      knowledge_req     JSONB NOT NULL DEFAULT '[]',
      production_time   INTEGER DEFAULT 60,
      base_value        NUMERIC(20,2) DEFAULT 100,
      labor_cost_pct    NUMERIC(5,4) DEFAULT 0.10,
      max_quantity      INTEGER DEFAULT 0,
      is_enabled        BOOLEAN DEFAULT TRUE,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS production_orders (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      country_id   UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      recipe_id    UUID NOT NULL REFERENCES item_recipes(id),
      quantity     INTEGER DEFAULT 1,
      status       VARCHAR(32) DEFAULT 'producing',
      money_cost   NUMERIC(20,2) DEFAULT 0,
      started_at   TIMESTAMPTZ DEFAULT NOW(),
      completes_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Market ───────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS market_listings (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id     UUID NOT NULL REFERENCES countries(id),
      item_name     VARCHAR(128) NOT NULL,
      resource_type VARCHAR(32),
      quantity      NUMERIC(20,4) NOT NULL,
      price_per_unit NUMERIC(20,4) NOT NULL,
      total_price   NUMERIC(20,4) GENERATED ALWAYS AS (quantity * price_per_unit) STORED,
      status        VARCHAR(32) DEFAULT 'active',
      expires_at    TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
      listed_at     TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS market_transactions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      listing_id    UUID NOT NULL REFERENCES market_listings(id),
      buyer_id      UUID NOT NULL REFERENCES countries(id),
      seller_id     UUID NOT NULL REFERENCES countries(id),
      quantity      NUMERIC(20,4) NOT NULL,
      price_per_unit NUMERIC(20,4) NOT NULL,
      total_cost    NUMERIC(20,4) NOT NULL,
      transacted_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Global Events ────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS global_events (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type           VARCHAR(64) NOT NULL,
      title          VARCHAR(255) NOT NULL,
      description    TEXT,
      severity       VARCHAR(32) DEFAULT 'medium',
      effects        JSONB DEFAULT '{}',
      affected_countries JSONB DEFAULT '[]',
      status         VARCHAR(32) DEFAULT 'active',
      started_at     TIMESTAMPTZ DEFAULT NOW(),
      ends_at        TIMESTAMPTZ,
      resolved_at    TIMESTAMPTZ
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS country_event_responses (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      country_id UUID NOT NULL REFERENCES countries(id),
      event_id   UUID NOT NULL REFERENCES global_events(id),
      response   VARCHAR(64),
      responded_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(country_id, event_id)
    );
  `);

  // ── Economy Ledger ───────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS economy_ticks (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      country_id     UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      tick_number    BIGINT NOT NULL,
      money_before   NUMERIC(20,2),
      money_after    NUMERIC(20,2),
      income         NUMERIC(20,2),
      expenditure    NUMERIC(20,2),
      gdp_delta      NUMERIC(20,2),
      happiness_delta NUMERIC(5,4),
      notes          JSONB DEFAULT '{}',
      ticked_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tick_counter (
      id    INTEGER PRIMARY KEY DEFAULT 1,
      value BIGINT DEFAULT 0
    );
    INSERT INTO tick_counter(id, value) VALUES(1, 0) ON CONFLICT DO NOTHING;
  `);

  // ── Resource Logs ─────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS resource_logs (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      country_id    UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      type          VARCHAR(32) NOT NULL,
      action        VARCHAR(32) NOT NULL,
      delta         NUMERIC(20,4) NOT NULL,
      amount_before NUMERIC(20,4) NOT NULL,
      amount_after  NUMERIC(20,4) NOT NULL,
      source        VARCHAR(64) DEFAULT 'system',
      logged_at     TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Indexes ─────────────────────────────────────────────────
  await query(`CREATE INDEX IF NOT EXISTS idx_resources_country  ON resources(country_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_knowledge_country  ON knowledge(country_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_policies_country   ON policies(country_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_country     ON production_orders(country_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_listings_status    ON market_listings(status);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_economy_country    ON economy_ticks(country_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_events_status      ON global_events(status);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_resource_logs_country ON resource_logs(country_id, type);`);

  console.log('[DB] ✅ All migrations complete.');
}

migrate().catch((err) => {
  console.error('[DB] Migration failed:', err);
  process.exit(1);
});

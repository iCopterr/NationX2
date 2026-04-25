import { query } from './pool';

/**
 * Seeds the database with the NationX item recipe catalog.
 * Run with: npm run db:seed
 *
 * Recipe design rules:
 *   - Every recipe has knowledge requirements
 *   - Every recipe has resource requirements (input_resources)
 *   - Labor cost = base_value × labor_cost_pct × quantity
 *   - Higher category = higher knowledge requirements
 *   - Instant crafts (production_time: 0) are for low-tier consumables
 */
export async function seed(): Promise<void> {
  console.log('[Seed] Starting seed...');

  type Recipe = {
    name: string;
    description: string;
    category: string;
    input_resources: { type: string; amount: number }[];
    output_resources: { type: string; amount: number }[];
    knowledge_req: { type: string; minLevel: number }[];
    production_time: number;
    base_value: number;
    labor_cost_pct: number;
    max_quantity: number;
  };

  const recipes: Recipe[] = [

    // ── MATERIALS ─────────────────────────────────────────────
    {
      name: 'Steel Ingot',
      description: 'Refined metal ingot — foundational building material.',
      category: 'materials',
      input_resources: [{ type: 'metal', amount: 40 }, { type: 'energy', amount: 15 }],
      output_resources: [{ type: 'metal', amount: 50 }],
      knowledge_req: [{ type: 'engineering', minLevel: 3 }],
      production_time: 60,
      base_value: 120,
      labor_cost_pct: 0.08,
      max_quantity: 100,
    },
    {
      name: 'Refined Fuel',
      description: 'Processed oil into usable fuel for vehicles and generators.',
      category: 'materials',
      input_resources: [{ type: 'oil', amount: 30 }, { type: 'energy', amount: 10 }],
      output_resources: [{ type: 'energy', amount: 40 }],
      knowledge_req: [{ type: 'engineering', minLevel: 5 }],
      production_time: 90,
      base_value: 180,
      labor_cost_pct: 0.08,
      max_quantity: 50,
    },
    {
      name: 'Composite Alloy',
      description: 'High-strength alloy used in advanced manufacturing.',
      category: 'materials',
      input_resources: [
        { type: 'metal', amount: 80 },
        { type: 'rare_earth', amount: 5 },
        { type: 'energy', amount: 30 },
      ],
      output_resources: [{ type: 'metal', amount: 60 }],
      knowledge_req: [
        { type: 'engineering', minLevel: 15 },
        { type: 'science', minLevel: 10 },
      ],
      production_time: 180,
      base_value: 600,
      labor_cost_pct: 0.12,
      max_quantity: 20,
    },

    // ── CONSUMABLES ───────────────────────────────────────────
    {
      name: 'Ration Pack',
      description: 'Emergency food rations for military or disaster relief.',
      category: 'consumables',
      input_resources: [{ type: 'food', amount: 60 }],
      output_resources: [{ type: 'food', amount: 80 }],
      knowledge_req: [{ type: 'science', minLevel: 2 }],
      production_time: 0,  // instant craft
      base_value: 80,
      labor_cost_pct: 0.05,
      max_quantity: 200,
    },
    {
      name: 'Processed Food',
      description: 'Preserved and packaged food for extended shelf life.',
      category: 'consumables',
      input_resources: [{ type: 'food', amount: 100 }, { type: 'energy', amount: 10 }],
      output_resources: [{ type: 'food', amount: 130 }],
      knowledge_req: [{ type: 'science', minLevel: 5 }],
      production_time: 60,
      base_value: 150,
      labor_cost_pct: 0.08,
      max_quantity: 100,
    },
    {
      name: 'Medical Supplies',
      description: 'Basic medical kits improving healthcare outcomes.',
      category: 'consumables',
      input_resources: [
        { type: 'food', amount: 30 },
        { type: 'rare_earth', amount: 2 },
        { type: 'energy', amount: 5 },
      ],
      output_resources: [],
      knowledge_req: [
        { type: 'science', minLevel: 12 },
        { type: 'engineering', minLevel: 5 },
      ],
      production_time: 120,
      base_value: 400,
      labor_cost_pct: 0.15,
      max_quantity: 50,
    },

    // ── TECHNOLOGY ────────────────────────────────────────────
    {
      name: 'Circuit Board',
      description: 'Basic printed circuit board for electronic devices.',
      category: 'technology',
      input_resources: [
        { type: 'metal', amount: 15 },
        { type: 'rare_earth', amount: 3 },
        { type: 'energy', amount: 20 },
      ],
      output_resources: [],
      knowledge_req: [
        { type: 'technology', minLevel: 8 },
        { type: 'engineering', minLevel: 6 },
      ],
      production_time: 150,
      base_value: 500,
      labor_cost_pct: 0.12,
      max_quantity: 50,
    },
    {
      name: 'Advanced Electronics',
      description: 'High-precision electronics for military and civilian applications.',
      category: 'technology',
      input_resources: [
        { type: 'rare_earth', amount: 10 },
        { type: 'metal', amount: 20 },
        { type: 'energy', amount: 50 },
      ],
      output_resources: [],
      knowledge_req: [
        { type: 'technology', minLevel: 20 },
        { type: 'engineering', minLevel: 15 },
        { type: 'science', minLevel: 10 },
      ],
      production_time: 300,
      base_value: 2000,
      labor_cost_pct: 0.15,
      max_quantity: 20,
    },
    {
      name: 'AI Module',
      description: 'Experimental AI processing unit — cutting-edge military and civilian tech.',
      category: 'technology',
      input_resources: [
        { type: 'rare_earth', amount: 25 },
        { type: 'metal', amount: 30 },
        { type: 'energy', amount: 100 },
      ],
      output_resources: [],
      knowledge_req: [
        { type: 'technology', minLevel: 50 },
        { type: 'science', minLevel: 40 },
        { type: 'engineering', minLevel: 35 },
      ],
      production_time: 900,
      base_value: 15000,
      labor_cost_pct: 0.20,
      max_quantity: 5,
    },

    // ── MILITARY ──────────────────────────────────────────────
    {
      name: 'Armored Vehicle',
      description: 'Light armored transport for troop movement.',
      category: 'military',
      input_resources: [
        { type: 'metal', amount: 200 },
        { type: 'energy', amount: 80 },
        { type: 'oil', amount: 30 },
      ],
      output_resources: [],
      knowledge_req: [
        { type: 'military', minLevel: 20 },
        { type: 'engineering', minLevel: 18 },
      ],
      production_time: 600,
      base_value: 8000,
      labor_cost_pct: 0.15,
      max_quantity: 10,
    },
    {
      name: 'Missile System',
      description: 'Long-range surface-to-surface missile platform.',
      category: 'military',
      input_resources: [
        { type: 'metal', amount: 500 },
        { type: 'rare_earth', amount: 30 },
        { type: 'energy', amount: 200 },
        { type: 'oil', amount: 100 },
      ],
      output_resources: [],
      knowledge_req: [
        { type: 'military', minLevel: 40 },
        { type: 'technology', minLevel: 30 },
        { type: 'engineering', minLevel: 35 },
      ],
      production_time: 1800,
      base_value: 50000,
      labor_cost_pct: 0.20,
      max_quantity: 3,
    },

    // ── INFRASTRUCTURE ────────────────────────────────────────
    {
      name: 'Solar Panel Array',
      description: 'Renewable energy generation — boosts energy production.',
      category: 'infrastructure',
      input_resources: [
        { type: 'rare_earth', amount: 8 },
        { type: 'metal', amount: 20 },
        { type: 'energy', amount: 15 },
      ],
      output_resources: [{ type: 'energy', amount: 0 }],
      knowledge_req: [
        { type: 'technology', minLevel: 10 },
        { type: 'science', minLevel: 8 },
        { type: 'engineering', minLevel: 8 },
      ],
      production_time: 240,
      base_value: 1000,
      labor_cost_pct: 0.12,
      max_quantity: 20,
    },
    {
      name: 'Water Purification Plant',
      description: 'Increases fresh water production and reduces consumption waste.',
      category: 'infrastructure',
      input_resources: [
        { type: 'metal', amount: 150 },
        { type: 'energy', amount: 60 },
      ],
      output_resources: [{ type: 'water', amount: 0 }],
      knowledge_req: [
        { type: 'engineering', minLevel: 20 },
        { type: 'science', minLevel: 15 },
      ],
      production_time: 480,
      base_value: 5000,
      labor_cost_pct: 0.12,
      max_quantity: 5,
    },

    // ── TRADE GOODS ───────────────────────────────────────────
    {
      name: 'Luxury Goods',
      description: 'High-value export goods that boost GDP and happiness.',
      category: 'trade_goods',
      input_resources: [
        { type: 'food', amount: 50 },
        { type: 'metal', amount: 20 },
        { type: 'rare_earth', amount: 3 },
      ],
      output_resources: [],
      knowledge_req: [
        { type: 'economics', minLevel: 10 },
        { type: 'technology', minLevel: 5 },
      ],
      production_time: 200,
      base_value: 2500,
      labor_cost_pct: 0.18,
      max_quantity: 30,
    },
    {
      name: 'Export Grain Bundle',
      description: 'Processed grain ready for international trade.',
      category: 'trade_goods',
      input_resources: [{ type: 'food', amount: 200 }, { type: 'energy', amount: 20 }],
      output_resources: [],
      knowledge_req: [{ type: 'economics', minLevel: 5 }],
      production_time: 120,
      base_value: 800,
      labor_cost_pct: 0.08,
      max_quantity: 50,
    },
  ];

  let added = 0;
  for (const r of recipes) {
    await query(
      `INSERT INTO item_recipes
         (name, description, category,
          input_resources, output_resources, knowledge_req,
          production_time, base_value, labor_cost_pct, max_quantity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (name) DO UPDATE
         SET description      = EXCLUDED.description,
             input_resources  = EXCLUDED.input_resources,
             output_resources = EXCLUDED.output_resources,
             knowledge_req    = EXCLUDED.knowledge_req,
             production_time  = EXCLUDED.production_time,
             base_value       = EXCLUDED.base_value,
             labor_cost_pct   = EXCLUDED.labor_cost_pct,
             max_quantity     = EXCLUDED.max_quantity`,
      [
        r.name, r.description, r.category,
        JSON.stringify(r.input_resources),
        JSON.stringify(r.output_resources),
        JSON.stringify(r.knowledge_req),
        r.production_time, r.base_value, r.labor_cost_pct, r.max_quantity,
      ]
    );
    added++;
  }

  console.log(`[Seed] ✅ ${added} recipes seeded across 6 categories.`);
}

seed().catch((err) => {
  console.error('[Seed] Failed:', err);
  process.exit(1);
});

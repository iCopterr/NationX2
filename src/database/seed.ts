import { query } from './pool';
import bcrypt from 'bcryptjs';

/**
 * Seeds the database with starter data for development.
 * Run with: npm run db:seed
 */
export async function seed(): Promise<void> {
  console.log('[Seed] Starting seed...');

  // ── Seed item recipes ────────────────────────────────────────
  const recipes = [
    {
      name: 'Steel Beam',
      description: 'Refined structural steel for construction and manufacturing.',
      category: 'materials',
      input_resources: [
        { type: 'metal', amount: 50 },
        { type: 'energy', amount: 20 },
      ],
      output_resources: [{ type: 'metal', amount: 30 }],
      knowledge_req: [{ type: 'engineering', minLevel: 5 }],
      production_time: 120,
      base_value: 200,
    },
    {
      name: 'Processed Food',
      description: 'Packaged food items ready for distribution.',
      category: 'consumables',
      input_resources: [
        { type: 'food', amount: 100 },
        { type: 'energy', amount: 10 },
      ],
      output_resources: [{ type: 'food', amount: 80 }],
      knowledge_req: [{ type: 'science', minLevel: 2 }],
      production_time: 60,
      base_value: 150,
    },
    {
      name: 'Advanced Electronics',
      description: 'High-tech electronic components for military and civilian use.',
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
      ],
      production_time: 300,
      base_value: 2000,
    },
    {
      name: 'Military Vehicle',
      description: 'Armored transport vehicle for military operations.',
      category: 'military',
      input_resources: [
        { type: 'metal', amount: 200 },
        { type: 'energy', amount: 100 },
        { type: 'oil', amount: 50 },
      ],
      output_resources: [],
      knowledge_req: [
        { type: 'military', minLevel: 25 },
        { type: 'engineering', minLevel: 20 },
      ],
      production_time: 600,
      base_value: 10000,
    },
    {
      name: 'Solar Panel',
      description: 'Renewable energy generation unit.',
      category: 'infrastructure',
      input_resources: [
        { type: 'rare_earth', amount: 5 },
        { type: 'metal', amount: 15 },
      ],
      output_resources: [{ type: 'energy', amount: 0 }],
      knowledge_req: [
        { type: 'technology', minLevel: 10 },
        { type: 'science', minLevel: 8 },
      ],
      production_time: 180,
      base_value: 800,
    },
  ];

  for (const r of recipes) {
    await query(
      `INSERT INTO item_recipes
         (name, description, category, input_resources, output_resources, knowledge_req, production_time, base_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (name) DO NOTHING`,
      [
        r.name,
        r.description,
        r.category,
        JSON.stringify(r.input_resources),
        JSON.stringify(r.output_resources),
        JSON.stringify(r.knowledge_req),
        r.production_time,
        r.base_value,
      ]
    );
  }

  console.log('[Seed] ✅ Seed complete.');
}

seed().catch((err) => {
  console.error('[Seed] Failed:', err);
  process.exit(1);
});

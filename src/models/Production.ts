// ============================================================
// Production Model — Recipes & Orders
// ============================================================
import { query, queryOne } from '../database/pool';
import { ResourceAmount, KnowledgeRequirement, ProductionStatus } from '../types';

export interface ItemRecipe {
  id: string;
  name: string;
  description: string;
  category: string;
  input_resources: ResourceAmount[];
  output_resources: ResourceAmount[];
  knowledge_req: KnowledgeRequirement[];
  production_time: number; // seconds
  base_value: number;
  is_enabled: boolean;
  created_at: Date;
}

export interface ProductionOrder {
  id: string;
  country_id: string;
  recipe_id: string;
  quantity: number;
  status: ProductionStatus;
  started_at: Date | null;
  completes_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export const ProductionModel = {
  // ── Recipes ─────────────────────────────────────────────────
  async findAllRecipes(): Promise<ItemRecipe[]> {
    return query<ItemRecipe>(
      'SELECT * FROM item_recipes WHERE is_enabled = TRUE ORDER BY base_value ASC'
    );
  },

  async findRecipeById(id: string): Promise<ItemRecipe | null> {
    return queryOne<ItemRecipe>('SELECT * FROM item_recipes WHERE id = $1', [id]);
  },

  async findRecipeByCategory(category: string): Promise<ItemRecipe[]> {
    return query<ItemRecipe>(
      'SELECT * FROM item_recipes WHERE category = $1 AND is_enabled = TRUE',
      [category]
    );
  },

  // ── Orders ──────────────────────────────────────────────────
  async findOrdersByCountry(countryId: string): Promise<ProductionOrder[]> {
    return query<ProductionOrder>(
      `SELECT * FROM production_orders WHERE country_id = $1 ORDER BY created_at DESC`,
      [countryId]
    );
  },

  async findOrderById(id: string): Promise<ProductionOrder | null> {
    return queryOne<ProductionOrder>('SELECT * FROM production_orders WHERE id = $1', [id]);
  },

  async findCompletedOrders(countryId: string): Promise<ProductionOrder[]> {
    return query<ProductionOrder>(
      `SELECT * FROM production_orders
       WHERE country_id = $1 AND status = 'producing' AND completes_at <= NOW()`,
      [countryId]
    );
  },

  async createOrder(countryId: string, recipeId: string, quantity: number, productionTimeSecs: number): Promise<ProductionOrder> {
    const row = await queryOne<ProductionOrder>(
      `INSERT INTO production_orders (country_id, recipe_id, quantity, status, started_at, completes_at)
       VALUES ($1, $2, $3, 'producing', NOW(), NOW() + ($4 || ' seconds')::interval)
       RETURNING *`,
      [countryId, recipeId, quantity, productionTimeSecs * quantity]
    );
    if (!row) throw new Error('Failed to create production order');
    return row;
  },

  async completeOrder(id: string): Promise<ProductionOrder | null> {
    return queryOne<ProductionOrder>(
      `UPDATE production_orders
       SET status = 'completed', completed_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
  },

  async findActiveOrdersByCountry(countryId: string): Promise<ProductionOrder[]> {
    return query<ProductionOrder>(
      `SELECT * FROM production_orders WHERE country_id = $1 AND status = 'producing'`,
      [countryId]
    );
  },
};

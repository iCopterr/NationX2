// ============================================================
// Production Model — Recipes & Orders (Crafting System)
// ============================================================
import { query, queryOne } from '../database/pool';
import {
  ResourceAmount,
  KnowledgeRequirement,
  ProductionStatus,
  ItemCategory,
} from '../types';

// ─── Recipe interface ─────────────────────────────────────────
export interface ItemRecipe {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  /** Resources consumed when crafting starts */
  input_resources: ResourceAmount[];
  /** Resources delivered when production completes */
  output_resources: ResourceAmount[];
  /** Knowledge gates — must pass ALL before crafting */
  knowledge_req: KnowledgeRequirement[];
  /** Seconds to produce ONE unit */
  production_time: number;
  /** Base market value of the output (used for labor cost calc) */
  base_value: number;
  /** Labor cost per unit = base_value * labor_cost_pct */
  labor_cost_pct: number;
  /** Max quantity allowed per order (0 = unlimited) */
  max_quantity: number;
  is_enabled: boolean;
  created_at: Date;
}

// ─── Order interface ──────────────────────────────────────────
export interface ProductionOrder {
  id: string;
  country_id: string;
  recipe_id: string;
  quantity: number;
  status: ProductionStatus;
  money_cost: number;
  started_at: Date | null;
  completes_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

/** Order joined with its recipe — useful for display */
export interface OrderWithRecipe extends ProductionOrder {
  recipe: ItemRecipe;
}

// ─── DTOs ─────────────────────────────────────────────────────
export interface CreateOrderDto {
  countryId: string;
  recipeId: string;
  quantity: number;
  moneyCost: number;
  productionTimeSecs: number;
}

// ─── Model ────────────────────────────────────────────────────
export const ProductionModel = {

  // ══════════════════════════════════════════════════════════
  // RECIPES
  // ══════════════════════════════════════════════════════════
  async findAllRecipes(): Promise<ItemRecipe[]> {
    return query<ItemRecipe>(
      `SELECT * FROM item_recipes
       WHERE is_enabled = TRUE
       ORDER BY category ASC, base_value ASC`
    );
  },

  async findRecipeById(id: string): Promise<ItemRecipe | null> {
    return queryOne<ItemRecipe>(
      'SELECT * FROM item_recipes WHERE id = $1',
      [id]
    );
  },

  async findRecipesByCategory(category: ItemCategory): Promise<ItemRecipe[]> {
    return query<ItemRecipe>(
      'SELECT * FROM item_recipes WHERE category = $1 AND is_enabled = TRUE ORDER BY base_value ASC',
      [category]
    );
  },

  async searchRecipes(term: string): Promise<ItemRecipe[]> {
    return query<ItemRecipe>(
      `SELECT * FROM item_recipes
       WHERE is_enabled = TRUE
         AND (name ILIKE $1 OR description ILIKE $1)
       ORDER BY base_value ASC`,
      [`%${term}%`]
    );
  },

  // ══════════════════════════════════════════════════════════
  // ORDERS
  // ══════════════════════════════════════════════════════════
  async createOrder(dto: CreateOrderDto): Promise<ProductionOrder> {
    const totalSecs = dto.productionTimeSecs * dto.quantity;
    const row = await queryOne<ProductionOrder>(
      `INSERT INTO production_orders
         (country_id, recipe_id, quantity, status, money_cost, started_at, completes_at)
       VALUES
         ($1, $2, $3, 'producing', $4, NOW(), NOW() + ($5 || ' seconds')::interval)
       RETURNING *`,
      [dto.countryId, dto.recipeId, dto.quantity, dto.moneyCost, totalSecs]
    );
    if (!row) throw new Error('Failed to create production order');
    return row;
  },

  async findOrderById(id: string): Promise<ProductionOrder | null> {
    return queryOne<ProductionOrder>(
      'SELECT * FROM production_orders WHERE id = $1',
      [id]
    );
  },

  async findOrdersByCountry(countryId: string, limit = 50): Promise<ProductionOrder[]> {
    return query<ProductionOrder>(
      `SELECT * FROM production_orders
       WHERE country_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [countryId, limit]
    );
  },

  async findActiveOrders(countryId: string): Promise<ProductionOrder[]> {
    return query<ProductionOrder>(
      `SELECT * FROM production_orders
       WHERE country_id = $1 AND status = 'producing'
       ORDER BY completes_at ASC`,
      [countryId]
    );
  },

  /** Orders where the timer has expired but status is still 'producing' */
  async findCompletedOrders(countryId: string): Promise<ProductionOrder[]> {
    return query<ProductionOrder>(
      `SELECT * FROM production_orders
       WHERE country_id = $1
         AND status = 'producing'
         AND completes_at <= NOW()`,
      [countryId]
    );
  },

  async completeOrder(id: string): Promise<ProductionOrder | null> {
    return queryOne<ProductionOrder>(
      `UPDATE production_orders
       SET status = 'completed', completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
  },

  async cancelOrder(id: string, countryId: string): Promise<ProductionOrder | null> {
    return queryOne<ProductionOrder>(
      `UPDATE production_orders
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1 AND country_id = $2 AND status = 'producing'
       RETURNING *`,
      [id, countryId]
    );
  },

  /** Count active orders for a country — used to enforce a concurrency cap */
  async countActiveOrders(countryId: string): Promise<number> {
    const row = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM production_orders
       WHERE country_id = $1 AND status = 'producing'`,
      [countryId]
    );
    return parseInt(row?.count ?? '0', 10);
  },
};

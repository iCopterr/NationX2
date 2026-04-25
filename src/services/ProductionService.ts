// ============================================================
// Production Service — Crafting System
//
//   craftItem(countryId, itemId, quantity?)
//   checkCraftRequirements(countryId, itemId, quantity?)
//   cancelOrder(countryId, orderId)
//   processCompletedOrders(countryId)
// ============================================================
import { ProductionModel, ItemRecipe } from '../models/Production';
import { KnowledgeService } from './KnowledgeService';
import { ResourceService } from './ResourceService';
import { ResourceModel, RESOURCE_CONFIG } from '../models/Resource';
import { CountryModel } from '../models/Country';
import {
  ResourceAmount,
  CraftCost,
  CraftRequirementsCheck,
  CraftResult,
  ItemCategory,
} from '../types';

// ─── Constants ───────────────────────────────────────────────
/** Maximum concurrent production orders per country */
const MAX_CONCURRENT_ORDERS = 5;

/** Default quantity when not specified */
const DEFAULT_QUANTITY = 1;

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Build the full cost breakdown for a recipe × quantity.
 * Does NOT touch the DB — safe to call for previews.
 */
function buildCraftCost(recipe: ItemRecipe, quantity: number): CraftCost {
  const laborPct = Number(recipe.labor_cost_pct ?? 0.1);
  return {
    resourceCosts: recipe.input_resources.map((r) => ({
      type: r.type,
      amount: r.amount * quantity,
    })),
    moneyCost: recipe.base_value * laborPct * quantity,
    productionTimeSecs: recipe.production_time * quantity,
  };
}

// ─── Service ─────────────────────────────────────────────────
export const ProductionService = {

  // ══════════════════════════════════════════════════════════
  // craftItem(countryId, itemId, quantity?)
  //
  // Gate order:
  //   1. Recipe exists & is enabled
  //   2. Quantity within recipe limits
  //   3. Concurrent order cap not exceeded
  //   4. Knowledge requirements met         ← checkKnowledgeRequirement
  //   5. Resources available & deducted     ← deductResources
  //   6. Money available & deducted         ← updateMoney
  //   7. Production order created
  //   8. Instant-complete if production_time === 0
  //
  // Returns a full CraftResult with cost breakdown and delivery preview.
  // ══════════════════════════════════════════════════════════
  async craftItem(
    countryId: string,
    itemId: string,
    quantity: number = DEFAULT_QUANTITY
  ): Promise<CraftResult> {
    if (quantity < 1) throw new Error('Quantity must be at least 1');

    // ── Gate 1: Recipe exists ───────────────────────────────
    const recipe = await ProductionModel.findRecipeById(itemId);
    if (!recipe) throw new Error(`Recipe not found: ${itemId}`);
    if (!recipe.is_enabled) throw new Error(`Recipe "${recipe.name}" is not currently available`);

    // ── Gate 2: Quantity limit ──────────────────────────────
    const maxQty = Number(recipe.max_quantity ?? 0);
    if (maxQty > 0 && quantity > maxQty) {
      throw new Error(`Maximum quantity for "${recipe.name}" is ${maxQty} per order`);
    }

    // ── Gate 3: Concurrent order cap ───────────────────────
    const activeCount = await ProductionModel.countActiveOrders(countryId);
    if (activeCount >= MAX_CONCURRENT_ORDERS) {
      throw new Error(
        `Production queue full (${activeCount}/${MAX_CONCURRENT_ORDERS} active orders). ` +
        `Wait for an order to complete or cancel one.`
      );
    }

    // Build cost (non-destructive — no DB writes yet)
    const cost = buildCraftCost(recipe, quantity);

    // ── Gate 4: Knowledge requirements ─────────────────────
    if (recipe.knowledge_req.length > 0) {
      const knowledgeCheck = await KnowledgeService.checkKnowledgeRequirement(
        countryId,
        recipe.knowledge_req
      );
      if (!knowledgeCheck.met) {
        throw new Error(
          `Knowledge requirements not met for "${recipe.name}":\n` +
          knowledgeCheck.missing
            .map((m) => `  • ${m.label}: need level ${m.required}, have ${m.current}`)
            .join('\n')
        );
      }
    }

    // ── Gate 5: Resources — validate ALL before deducting ANY
    if (cost.resourceCosts.length > 0) {
      // Build shortage list for informative error
      const shortages: string[] = [];
      for (const rc of cost.resourceCosts) {
        const available = await ResourceModel.getAmount(countryId, rc.type);
        if (available < rc.amount) {
          const label = RESOURCE_CONFIG[rc.type]?.label ?? rc.type;
          shortages.push(`${label}: need ${rc.amount}, have ${available.toFixed(2)}`);
        }
      }
      if (shortages.length > 0) {
        throw new Error(
          `Insufficient resources for "${recipe.name}" ×${quantity}:\n` +
          shortages.map((s) => `  • ${s}`).join('\n')
        );
      }
      // All resources confirmed — deduct atomically
      await ResourceService.deductResources(countryId, cost.resourceCosts);
    }

    // ── Gate 6: Money ───────────────────────────────────────
    if (cost.moneyCost > 0) {
      const country = await CountryModel.findById(countryId);
      if (!country) throw new Error('Country not found');
      if (Number(country.money) < cost.moneyCost) {
        // Resources already deducted — refund them on money failure
        await ResourceService.addResources(countryId, cost.resourceCosts);
        throw new Error(
          `Insufficient funds for "${recipe.name}" labor costs ` +
          `(need ${cost.moneyCost.toFixed(2)}, have ${Number(country.money).toFixed(2)}). Resources refunded.`
        );
      }
      await CountryModel.updateMoney(countryId, -cost.moneyCost);
    }

    // ── Gate 7: Create production order ────────────────────
    const order = await ProductionModel.createOrder({
      countryId,
      recipeId: recipe.id,
      quantity,
      moneyCost: cost.moneyCost,
      productionTimeSecs: recipe.production_time,
    });

    const scaledOutputs: ResourceAmount[] = recipe.output_resources.map((r) => ({
      type: r.type,
      amount: r.amount * quantity,
    }));

    // ── Gate 8: Instant crafting (production_time === 0) ───
    const isInstant = recipe.production_time === 0;
    let deliveredOutputs: ResourceAmount[] | undefined;

    if (isInstant) {
      if (scaledOutputs.length > 0) {
        await ResourceService.addResources(countryId, scaledOutputs);
        deliveredOutputs = scaledOutputs;
      }
      await ProductionModel.completeOrder(order.id);
    }

    return {
      orderId: order.id,
      recipeId: recipe.id,
      recipeName: recipe.name,
      category: recipe.category as ItemCategory,
      quantity,
      cost,
      status: isInstant ? 'completed' : 'producing',
      startsAt: order.started_at ?? new Date(),
      completesAt: order.completes_at ?? new Date(),
      outputPreview: scaledOutputs,
      isInstant,
      deliveredOutputs,
    };
  },

  // ══════════════════════════════════════════════════════════
  // checkCraftRequirements(countryId, itemId, quantity?)
  //
  // Pre-flight check — returns full breakdown without side effects.
  // Frontend uses this to gate/highlight the Craft button.
  // ══════════════════════════════════════════════════════════
  async checkCraftRequirements(
    countryId: string,
    itemId: string,
    quantity: number = DEFAULT_QUANTITY
  ): Promise<CraftRequirementsCheck> {
    const recipe = await ProductionModel.findRecipeById(itemId);
    if (!recipe) throw new Error(`Recipe not found: ${itemId}`);

    const cost = buildCraftCost(recipe, quantity);

    // Knowledge check
    const knowledgeResult = await KnowledgeService.checkKnowledgeRequirement(
      countryId,
      recipe.knowledge_req
    );

    // Resources check
    const resourcesMissing: Array<{ type: string; required: number; current: number }> = [];
    for (const rc of cost.resourceCosts) {
      const current = await ResourceModel.getAmount(countryId, rc.type);
      if (current < rc.amount) {
        resourcesMissing.push({ type: rc.type, required: rc.amount, current });
      }
    }

    // Money check
    const country = await CountryModel.findById(countryId);
    const availableMoney = Number(country?.money ?? 0);
    const moneyMissing = Math.max(0, cost.moneyCost - availableMoney);

    const knowledgeMet = knowledgeResult.met;
    const resourcesMet = resourcesMissing.length === 0;
    const moneyMet = moneyMissing === 0;

    return {
      canCraft: knowledgeMet && resourcesMet && moneyMet,
      knowledgeMet,
      resourcesMet,
      moneyMet,
      knowledgeMissing: knowledgeResult.missing,
      resourcesMissing,
      moneyMissing,
      cost,
    };
  },

  // ──────────────────────────────────────────────────────────
  // cancelOrder(countryId, orderId)
  // Cancels an in-progress order and refunds resources.
  // ──────────────────────────────────────────────────────────
  async cancelOrder(countryId: string, orderId: string) {
    const order = await ProductionModel.findOrderById(orderId);
    if (!order) throw new Error('Order not found');
    if (order.country_id !== countryId) throw new Error('Not your order');
    if (order.status !== 'producing') {
      throw new Error(`Cannot cancel order with status "${order.status}"`);
    }

    const recipe = await ProductionModel.findRecipeById(order.recipe_id);
    if (!recipe) throw new Error('Recipe data missing');

    // Cancel the order first
    const cancelled = await ProductionModel.cancelOrder(orderId, countryId);
    if (!cancelled) throw new Error('Cancel failed (order may have just completed)');

    // Refund resources (50% refund — partial resources consumed as overhead)
    const refundedResources: ResourceAmount[] = recipe.input_resources.map((r) => ({
      type: r.type,
      amount: r.amount * order.quantity * 0.5,
    }));
    if (refundedResources.length > 0) {
      await ResourceService.addResources(countryId, refundedResources);
    }

    // Refund money (50% of labor cost)
    const moneyRefund = Number(order.money_cost) * 0.5;
    if (moneyRefund > 0) {
      await CountryModel.updateMoney(countryId, moneyRefund);
    }

    return {
      order: cancelled,
      refundedResources,
      moneyRefund,
      message: `Order cancelled. 50% of resources and money refunded.`,
    };
  },

  // ──────────────────────────────────────────────────────────
  // processCompletedOrders(countryId)
  // Called by the economy tick engine — delivers outputs.
  // ──────────────────────────────────────────────────────────
  async processCompletedOrders(countryId: string) {
    const completed = await ProductionModel.findCompletedOrders(countryId);
    const processed: Array<{
      orderId: string;
      recipeName: string;
      quantity: number;
      outputs: ResourceAmount[];
    }> = [];

    for (const order of completed) {
      const recipe = await ProductionModel.findRecipeById(order.recipe_id);
      if (!recipe) continue;

      // Deliver outputs scaled by quantity
      const scaledOutputs: ResourceAmount[] = recipe.output_resources.map((r) => ({
        type: r.type,
        amount: r.amount * order.quantity,
      }));

      if (scaledOutputs.length > 0) {
        await ResourceService.addResources(countryId, scaledOutputs);
      }

      await ProductionModel.completeOrder(order.id);
      processed.push({
        orderId: order.id,
        recipeName: recipe.name,
        quantity: order.quantity,
        outputs: scaledOutputs,
      });
    }

    return processed;
  },

  // ──────────────────────────────────────────────────────────
  // Recipe query helpers
  // ──────────────────────────────────────────────────────────
  async getRecipes() {
    return ProductionModel.findAllRecipes();
  },

  async getRecipesByCategory(category: string) {
    return ProductionModel.findRecipesByCategory(category as ItemCategory);
  },

  async getRecipeById(id: string) {
    return ProductionModel.findRecipeById(id);
  },

  async searchRecipes(term: string) {
    return ProductionModel.searchRecipes(term);
  },

  async getOrders(countryId: string, limit?: number) {
    return ProductionModel.findOrdersByCountry(countryId, limit);
  },

  async getActiveOrders(countryId: string) {
    return ProductionModel.findActiveOrders(countryId);
  },

  getCategories(): ItemCategory[] {
    return ['materials', 'consumables', 'technology', 'military', 'infrastructure', 'trade_goods'];
  },
};

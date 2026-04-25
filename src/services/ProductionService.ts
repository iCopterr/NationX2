// ============================================================
// Production Service
// ============================================================
import { ProductionModel, ItemRecipe } from '../models/Production';
import { KnowledgeService } from './KnowledgeService';
import { ResourceService } from './ResourceService';
import { CountryModel } from '../models/Country';

export const ProductionService = {
  async getRecipes() {
    return ProductionModel.findAllRecipes();
  },

  async getRecipesByCategory(category: string) {
    return ProductionModel.findRecipeByCategory(category);
  },

  async getOrders(countryId: string) {
    return ProductionModel.findOrdersByCountry(countryId);
  },

  async getActiveOrders(countryId: string) {
    return ProductionModel.findActiveOrdersByCountry(countryId);
  },

  /**
   * Attempt to produce an item:
   * 1. Check knowledge requirements
   * 2. Check & deduct input resources
   * 3. Deduct money (labor cost)
   * 4. Create production order
   */
  async craftItem(countryId: string, recipeId: string, quantity: number) {
    if (quantity < 1) throw new Error('Quantity must be at least 1');

    const recipe = await ProductionModel.findRecipeById(recipeId);
    if (!recipe) throw new Error('Recipe not found');

    // 1. Knowledge check
    const check = await KnowledgeService.checkKnowledgeRequirement(countryId, recipe.knowledge_req);
    if (!check.met) {
      throw new Error(
        `Knowledge requirements not met: ${check.missing
          .map((m) => `${m.label} (need ${m.required}, have ${m.current})`)
          .join(', ')}`
      );
    }

    // 2. Resource check — scale input by quantity
    const scaledInputs = recipe.input_resources.map((r) => ({
      ...r,
      amount: r.amount * quantity,
    }));
    await ResourceService.deductResources(countryId, scaledInputs);

    // 3. Labor cost (10% of base_value per unit)
    const laborCost = recipe.base_value * quantity * 0.1;
    const country = await CountryModel.findById(countryId);
    if (!country) throw new Error('Country not found');
    if (country.money < laborCost) throw new Error(`Insufficient funds for labor (need ${laborCost})`);
    await CountryModel.updateMoney(countryId, -laborCost);

    // 4. Create order
    const order = await ProductionModel.createOrder(countryId, recipeId, quantity, recipe.production_time);
    return { order, recipe, laborCost };
  },

  /**
   * Process completed orders — deliver output resources.
   * Called each economy tick.
   */
  async processCompletedOrders(countryId: string) {
    const completed = await ProductionModel.findCompletedOrders(countryId);
    const processed = [];

    for (const order of completed) {
      const recipe = await ProductionModel.findRecipeById(order.recipe_id);
      if (!recipe) continue;

      // Deliver scaled outputs
      const scaledOutputs = recipe.output_resources.map((r) => ({
        ...r,
        amount: r.amount * order.quantity,
      }));
      if (scaledOutputs.length > 0) {
        await ResourceService.addResources(countryId, scaledOutputs);
      }

      await ProductionModel.completeOrder(order.id);

      processed.push({ orderId: order.id, recipe: recipe.name, outputs: scaledOutputs });
    }

    return processed;
  },
};

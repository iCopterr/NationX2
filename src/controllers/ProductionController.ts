// ============================================================
// Production Controller — Crafting System
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { body, query as queryValidator, param, validationResult } from 'express-validator';
import { ProductionService } from '../services/ProductionService';
import { ApiResponse } from '../types';
import { extractErrors } from './helpers';

export const productionValidation = {
  /** POST /production/craft */
  craft: [
    body('itemId')
      .isUUID()
      .withMessage('itemId must be a valid UUID'),
    body('quantity')
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage('quantity must be an integer between 1 and 500'),
  ],

  /** POST /production/check */
  check: [
    body('itemId').isUUID().withMessage('itemId must be a valid UUID'),
    body('quantity').optional().isInt({ min: 1 }).withMessage('quantity must be positive'),
  ],
};

export const ProductionController = {
  /**
   * GET /production/recipes
   * All enabled recipes, optionally filtered by category or search term.
   */
  async getRecipes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const category = req.query.category as string | undefined;
      const search = req.query.search as string | undefined;

      let recipes;
      if (search) {
        recipes = await ProductionService.searchRecipes(search);
      } else if (category) {
        recipes = await ProductionService.getRecipesByCategory(category);
      } else {
        recipes = await ProductionService.getRecipes();
      }

      res.json({ success: true, data: recipes } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * GET /production/recipes/categories
   * Returns all valid item categories (public — no auth needed).
   */
  async getCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: ProductionService.getCategories() } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * GET /production/recipes/:id
   * Single recipe detail.
   */
  async getRecipeById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const recipe = await ProductionService.getRecipeById(req.params.id);
      if (!recipe) {
        res.status(404).json({ success: false, message: 'Recipe not found' } satisfies ApiResponse);
        return;
      }
      res.json({ success: true, data: recipe } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * GET /production/orders
   * All orders for the authenticated country.
   */
  async getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);
      const orders = await ProductionService.getOrders(req.user!.countryId, limit);
      res.json({ success: true, data: orders } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * GET /production/orders/active
   * Only in-progress orders with time remaining.
   */
  async getActiveOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orders = await ProductionService.getActiveOrders(req.user!.countryId);
      res.json({ success: true, data: orders } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * POST /production/check
   * Pre-flight requirements check — no side effects.
   * Frontend calls this to show cost breakdown before the user clicks Craft.
   */
  async checkRequirements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { itemId, quantity } = req.body as { itemId: string; quantity?: number };
      const check = await ProductionService.checkCraftRequirements(
        req.user!.countryId,
        itemId,
        quantity ?? 1
      );

      // 200 = can craft, 422 = cannot craft (but not a client error)
      res.status(check.canCraft ? 200 : 422).json({
        success: true,
        data: check,
        message: check.canCraft
          ? 'Requirements met. Ready to craft.'
          : `Cannot craft: ${[
              !check.knowledgeMet && 'knowledge',
              !check.resourcesMet && 'resources',
              !check.moneyMet    && 'funds',
            ].filter(Boolean).join(', ')} insufficient.`,
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * POST /production/craft
   * craftItem(countryId, itemId, quantity?)
   * Main crafting endpoint — validates gates, deducts costs, creates order.
   */
  async craftItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { itemId, quantity } = req.body as { itemId: string; quantity?: number };
      const result = await ProductionService.craftItem(req.user!.countryId, itemId, quantity ?? 1);

      const msg = result.isInstant
        ? `✅ "${result.recipeName}" crafted instantly × ${result.quantity}`
        : `🏭 "${result.recipeName}" × ${result.quantity} in production — completes at ${result.completesAt.toISOString()}`;

      res.status(201).json({
        success: true,
        data: result,
        message: msg,
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * DELETE /production/orders/:orderId
   * Cancel an active order — 50% resource/money refund.
   */
  async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ProductionService.cancelOrder(
        req.user!.countryId,
        req.params.orderId
      );
      res.json({
        success: true,
        data: result,
        message: result.message,
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },
};

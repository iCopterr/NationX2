// ============================================================
// Production Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { ProductionService } from '../services/ProductionService';
import { ApiResponse } from '../types';
import { extractErrors } from './helpers';

export const productionValidation = {
  craft: [
    body('recipeId').isUUID().withMessage('Invalid recipe ID'),
    body('quantity').isInt({ min: 1, max: 100 }).withMessage('Quantity must be 1-100'),
  ],
};

export const ProductionController = {
  async getRecipes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const category = req.query.category as string | undefined;
      const recipes = category
        ? await ProductionService.getRecipesByCategory(category)
        : await ProductionService.getRecipes();
      res.json({ success: true, data: recipes } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orders = await ProductionService.getOrders(req.user!.countryId);
      res.json({ success: true, data: orders } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async getActiveOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orders = await ProductionService.getActiveOrders(req.user!.countryId);
      res.json({ success: true, data: orders } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async craftItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { recipeId, quantity } = req.body as { recipeId: string; quantity: number };
      const result = await ProductionService.craftItem(req.user!.countryId, recipeId, quantity);

      res.status(201).json({
        success: true,
        data: result,
        message: `Started production: ${result.recipe.name} x${quantity}`,
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },
};

// ============================================================
// Resource Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { ResourceService } from '../services/ResourceService';
import { ResourceType, ApiResponse } from '../types';
import { extractErrors } from './helpers';

const VALID_RESOURCE_TYPES: ResourceType[] = ['metal', 'energy', 'food', 'oil', 'water', 'rare_earth'];

export const resourceValidation = {
  explore: [
    body('type').isIn(VALID_RESOURCE_TYPES).withMessage('Invalid resource type'),
    body('investment').isFloat({ min: 100 }).withMessage('Investment must be at least 100'),
  ],
};

export const ResourceController = {
  async getResources(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resources = await ResourceService.getResources(req.user!.countryId);
      res.json({ success: true, data: resources } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async exploreResource(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { type, investment } = req.body as { type: ResourceType; investment: number };
      const result = await ResourceService.exploreResource(req.user!.countryId, type, investment);

      res.json({
        success: true,
        data: result,
        message: `Discovered ${result.discovered} units of ${type}`,
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },
};

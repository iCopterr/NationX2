// ============================================================
// Resource Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { ResourceService } from '../services/ResourceService';
import { ResourceType, ApiResponse } from '../types';
import { extractErrors } from './helpers';

const VALID_TYPES = ResourceService.getValidTypes();

export const resourceValidation = {
  /** POST /resources/produce */
  produce: [
    body('type')
      .isIn(VALID_TYPES)
      .withMessage(`type must be one of: ${VALID_TYPES.join(', ')}`),
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('amount must be a positive number'),
  ],

  /** POST /resources/consume */
  consume: [
    body('type')
      .isIn(VALID_TYPES)
      .withMessage(`type must be one of: ${VALID_TYPES.join(', ')}`),
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('amount must be a positive number'),
  ],

  /** POST /resources/explore */
  explore: [
    body('type')
      .isIn(VALID_TYPES)
      .withMessage(`type must be one of: ${VALID_TYPES.join(', ')}`),
    body('investment')
      .isFloat({ min: 100 })
      .withMessage('Investment must be at least 100'),
  ],
};

export const ResourceController = {
  /**
   * GET /resources
   * Full resource snapshot with fill percentages and per-tick rates.
   */
  async getResources(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resources = await ResourceService.getResources(req.user!.countryId);
      res.json({ success: true, data: resources } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * GET /resources/types
   * Static config for all resource types (public — no auth).
   */
  async getTypes(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: ResourceService.getConfig() } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * GET /resources/logs
   * Recent resource change history for the authenticated country.
   */
  async getLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const type = req.query.type as ResourceType | undefined;
      const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);

      if (type && !VALID_TYPES.includes(type)) {
        res.status(400).json({ success: false, message: `Invalid type: ${type}` } satisfies ApiResponse);
        return;
      }

      const logs = await ResourceService.getLogs(req.user!.countryId, type, limit);
      res.json({ success: true, data: logs } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * POST /resources/produce
   * produceResource(countryId, type, amount)
   * Infrastructure allocation boosts the actual yield.
   */
  async produceResource(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { type, amount } = req.body as { type: ResourceType; amount: number };
      const result = await ResourceService.produceResource(req.user!.countryId, type, amount);

      const bonusPct = (result.infrastructureBonus * 100).toFixed(1);
      res.json({
        success: true,
        data: result,
        message: `Produced ${result.produced.toFixed(2)} ${type}` +
          (result.infrastructureBonus > 0 ? ` (infra bonus: +${bonusPct}%)` : ''),
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * POST /resources/consume
   * consumeResource(countryId, type, amount)
   * Returns deficit and happiness penalty if stock is insufficient.
   */
  async consumeResource(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { type, amount } = req.body as { type: ResourceType; amount: number };
      const result = await ResourceService.consumeResource(req.user!.countryId, type, amount);

      res.json({
        success: true,
        data: result,
        message: result.inDeficit
          ? `⚠ Deficit! Consumed ${result.consumed.toFixed(2)} of ${result.requested} ${type} needed. Happiness −${result.happinessPenalty.toFixed(2)}`
          : `Consumed ${result.consumed.toFixed(2)} ${type}.`,
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * POST /resources/explore
   * exploreResource(countryId, type, investment)
   * Risk/reward: outcome depends on a dice roll modified by engineering level.
   */
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
        message: result.message,
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },
};

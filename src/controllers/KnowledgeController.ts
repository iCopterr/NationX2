// ============================================================
// Knowledge Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { KnowledgeService } from '../services/KnowledgeService';
import { KnowledgeType, KnowledgeRequirement, ApiResponse } from '../types';
import { extractErrors } from './helpers';

const VALID_TYPES = KnowledgeService.getValidTypes();

export const knowledgeValidation = {
  /** POST /knowledge/add */
  add: [
    body('type')
      .isIn(VALID_TYPES)
      .withMessage(`type must be one of: ${VALID_TYPES.join(', ')}`),
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('amount must be a positive number'),
  ],

  /** POST /knowledge/research */
  research: [
    body('type')
      .isIn(VALID_TYPES)
      .withMessage(`type must be one of: ${VALID_TYPES.join(', ')}`),
    body('investment')
      .isFloat({ min: 500 })
      .withMessage('Research investment must be at least 500'),
  ],

  /** POST /knowledge/check */
  check: [
    body('requirements')
      .isArray({ min: 1 })
      .withMessage('requirements must be a non-empty array'),
    body('requirements.*.type')
      .isIn(VALID_TYPES)
      .withMessage(`Each requirement type must be one of: ${VALID_TYPES.join(', ')}`),
    body('requirements.*.minLevel')
      .isInt({ min: 1 })
      .withMessage('Each requirement minLevel must be a positive integer'),
  ],
};

export const KnowledgeController = {
  /**
   * GET /knowledge
   * Full knowledge snapshot — all domains with levels, XP, progress.
   */
  async getKnowledge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const snapshot = await KnowledgeService.getKnowledge(req.user!.countryId);
      res.json({ success: true, data: snapshot } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * GET /knowledge/:type
   * Single knowledge domain detail.
   */
  async getKnowledgeByType(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const type = req.params.type as KnowledgeType;
      if (!VALID_TYPES.includes(type)) {
        res.status(400).json({
          success: false,
          message: `Invalid type. Valid types: ${VALID_TYPES.join(', ')}`,
        } satisfies ApiResponse);
        return;
      }

      const snapshot = await KnowledgeService.getKnowledge(req.user!.countryId);
      const domain = snapshot.byType[type];

      res.json({
        success: true,
        data: {
          domain,
          config: KnowledgeService.getConfig()[type],
        },
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * POST /knowledge/add
   * addKnowledge(countryId, type, amount) — direct XP injection.
   * In production this would be restricted to admin/game events.
   * During dev, useful to test progression without spending money.
   */
  async addKnowledge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { type, amount } = req.body as { type: KnowledgeType; amount: number };
      const result = await KnowledgeService.addKnowledge(req.user!.countryId, type, amount);

      res.json({
        success: true,
        data: result,
        message: result.levelsGained > 0
          ? `${result.levelsGained} level(s) gained! ${type} is now level ${result.levelAfter}.`
          : `+${amount.toFixed(2)} XP added to ${type} (level ${result.levelAfter}).`,
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * POST /knowledge/research
   * Spend money to gain XP (active research — calls addKnowledge internally).
   */
  async research(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { type, investment } = req.body as { type: KnowledgeType; investment: number };
      const result = await KnowledgeService.research(req.user!.countryId, type, investment);

      res.json({
        success: true,
        data: result,
        message: `Invested ${investment} → +${result.xpGained.toFixed(2)} XP in ${type}` +
          (result.knowledge.levelsGained > 0
            ? ` | Level up! Now level ${result.knowledge.levelAfter}`
            : ` | Level ${result.knowledge.levelAfter}`),
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * POST /knowledge/check
   * checkKnowledgeRequirement(countryId, requirement[])
   * Check if this country meets a set of knowledge requirements.
   * Used by frontend to gate actions before the user tries them.
   */
  async checkRequirements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { requirements } = req.body as { requirements: KnowledgeRequirement[] };
      const result = await KnowledgeService.checkKnowledgeRequirement(
        req.user!.countryId,
        requirements
      );

      res.status(result.met ? 200 : 422).json({
        success: true,
        data: result,
        message: result.summary,
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /**
   * GET /knowledge/types
   * Returns all valid knowledge type configs.
   * Use this to render knowledge trees in the frontend.
   */
  async getTypes(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({
        success: true,
        data: KnowledgeService.getConfig(),
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },
};

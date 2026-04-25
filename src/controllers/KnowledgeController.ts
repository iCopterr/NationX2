// ============================================================
// Knowledge Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { KnowledgeService } from '../services/KnowledgeService';
import { KnowledgeType, ApiResponse } from '../types';
import { extractErrors } from './helpers';

const VALID_KNOWLEDGE_TYPES: KnowledgeType[] = ['technology', 'military', 'engineering', 'science', 'economics', 'medicine'];

export const knowledgeValidation = {
  research: [
    body('type').isIn(VALID_KNOWLEDGE_TYPES).withMessage('Invalid knowledge type'),
    body('investment').isFloat({ min: 500 }).withMessage('Research investment must be at least 500'),
  ],
};

export const KnowledgeController = {
  async getKnowledge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const knowledge = await KnowledgeService.getKnowledge(req.user!.countryId);
      res.json({ success: true, data: knowledge } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

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
        message: `Researched ${type}: +${result.xpGained.toFixed(2)} XP`,
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },
};

// ============================================================
// Policy Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { PolicyService } from '../services/PolicyService';
import { PolicyModel } from '../models/Policy';
import { ApiResponse } from '../types';
import { extractErrors } from './helpers';

export const policyValidation = {
  propose: [
    body('catalogIndex').isInt({ min: 0 }).withMessage('Invalid catalog index'),
  ],
  allocation: [
    body('education').optional().isFloat({ min: 0, max: 100 }),
    body('military').optional().isFloat({ min: 0, max: 100 }),
    body('technology').optional().isFloat({ min: 0, max: 100 }),
    body('economy').optional().isFloat({ min: 0, max: 100 }),
    body('healthcare').optional().isFloat({ min: 0, max: 100 }),
    body('infrastructure').optional().isFloat({ min: 0, max: 100 }),
  ],
};

export const PolicyController = {
  async getPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const policies = await PolicyService.getPolicies(req.user!.countryId);
      res.json({ success: true, data: policies } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async getCatalog(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: PolicyService.getCatalog() } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async getAllocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alloc = await PolicyModel.getAllocation(req.user!.countryId);
      res.json({ success: true, data: alloc } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async setAllocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }
      const alloc = await PolicyService.updateAllocation(req.user!.countryId, req.body as Record<string, number>);
      res.json({ success: true, data: alloc, message: 'Allocation updated' } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async proposePolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }
      const policy = await PolicyService.proposePolicy(req.user!.countryId, Number(req.body.catalogIndex));
      res.status(201).json({ success: true, data: policy } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async enactPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const policy = await PolicyService.enactPolicy(req.user!.countryId, req.params.id);
      res.json({ success: true, data: policy, message: `Policy "${policy.name}" enacted` } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async repealPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const policy = await PolicyService.repealPolicy(req.user!.countryId, req.params.id);
      res.json({ success: true, data: policy, message: `Policy "${policy.name}" repealed` } satisfies ApiResponse);
    } catch (err) { next(err); }
  },
};

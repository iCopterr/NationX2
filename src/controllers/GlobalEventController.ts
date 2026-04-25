// ============================================================
// Global Event Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { GlobalEventService } from '../services/GlobalEventService';
import { ApiResponse } from '../types';
import { extractErrors } from './helpers';

export const eventValidation = {
  respond: [
    body('response').isIn(['accept', 'reject', 'negotiate', 'observe'])
      .withMessage('Response must be: accept, reject, negotiate, or observe'),
  ],
};

export const GlobalEventController = {
  async getActiveEvents(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const events = await GlobalEventService.getActiveEvents();
      res.json({ success: true, data: events } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async getEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const event = await GlobalEventService.getEventById(req.params.id);
      if (!event) { res.status(404).json({ success: false, message: 'Event not found' } satisfies ApiResponse); return; }
      res.json({ success: true, data: event } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async respondToEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }
      const response = await GlobalEventService.respondToEvent(
        req.user!.countryId, req.params.id, req.body.response as string
      );
      res.json({ success: true, data: response } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async triggerRandom(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (process.env.NODE_ENV === 'production') {
        res.status(403).json({ success: false, message: 'Not allowed in production' } satisfies ApiResponse);
        return;
      }
      const event = await GlobalEventService.triggerRandomEvent();
      res.json({ success: true, data: event, message: event ? 'Event triggered' : 'No event triggered (RNG)' } satisfies ApiResponse);
    } catch (err) { next(err); }
  },
};

// ============================================================
// Economy Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { EconomyLoopService } from '../services/EconomyLoopService';
import { ApiResponse } from '../types';

export const EconomyController = {
  /** POST /economy/tick — Manual tick trigger (dev/admin only) */
  async triggerTick(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (process.env.NODE_ENV === 'production') {
        res.status(403).json({ success: false, message: 'Manual tick disabled in production' } satisfies ApiResponse);
        return;
      }
      const result = await EconomyLoopService.runGlobalTick();
      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  /** POST /economy/tick/me — Run tick for my country only */
  async tickMyCountry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (process.env.NODE_ENV === 'production') {
        res.status(403).json({ success: false, message: 'Manual tick disabled in production' } satisfies ApiResponse);
        return;
      }
      const tickNumber = await EconomyLoopService.incrementTick();
      const result = await EconomyLoopService.runForCountry(req.user!.countryId, tickNumber);
      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) { next(err); }
  },
};

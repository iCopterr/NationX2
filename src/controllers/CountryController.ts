// ============================================================
// Country Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { CountryModel } from '../models/Country';
import { ApiResponse } from '../types';
import { query } from '../database/pool';

export const CountryController = {
  /** GET /countries — Leaderboard */
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 100);
      const offset = parseInt((req.query.offset as string) ?? '0', 10);
      const [countries, total] = await Promise.all([
        CountryModel.findAll(limit, offset),
        CountryModel.count(),
      ]);
      res.json({ success: true, data: countries, total, page: Math.floor(offset / limit) + 1, limit } satisfies ApiResponse);
    } catch (err) {
      next(err);
    }
  },

  /** GET /countries/:id */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const country = await CountryModel.findById(req.params.id);
      if (!country) { res.status(404).json({ success: false, message: 'Country not found' } satisfies ApiResponse); return; }
      res.json({ success: true, data: country } satisfies ApiResponse);
    } catch (err) {
      next(err);
    }
  },

  /** GET /countries/me — My country + full stats */
  async getMyCountry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const countryId = req.user!.countryId;
      const country = await CountryModel.findById(countryId);
      if (!country) { res.status(404).json({ success: false, message: 'Country not found' } satisfies ApiResponse); return; }

      const lastTick = await query(
        `SELECT * FROM economy_ticks WHERE country_id = $1 ORDER BY ticked_at DESC LIMIT 1`,
        [countryId]
      );

      res.json({ success: true, data: { country, lastTick: lastTick[0] ?? null } } satisfies ApiResponse);
    } catch (err) {
      next(err);
    }
  },

  /** GET /countries/me/history — Economy tick history */
  async getEconomyHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) ?? '20', 10), 100);
      const ticks = await query(
        `SELECT * FROM economy_ticks WHERE country_id = $1 ORDER BY ticked_at DESC LIMIT $2`,
        [req.user!.countryId, limit]
      );
      res.json({ success: true, data: ticks } satisfies ApiResponse);
    } catch (err) {
      next(err);
    }
  },
};

// ============================================================
// Market Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { MarketService } from '../services/MarketService';
import { ResourceType, ApiResponse } from '../types';
import { extractErrors } from './helpers';

const VALID_RESOURCE_TYPES: ResourceType[] = ['metal', 'energy', 'food', 'oil', 'water', 'rare_earth'];

export const marketValidation = {
  list: [
    body('itemName').trim().notEmpty().withMessage('Item name required'),
    body('quantity').isFloat({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('pricePerUnit').isFloat({ min: 0.01 }).withMessage('Price must be positive'),
    body('resourceType').optional().isIn(VALID_RESOURCE_TYPES).withMessage('Invalid resource type'),
  ],
};

export const MarketController = {
  async getListings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 100);
      const offset = parseInt((req.query.offset as string) ?? '0', 10);
      const listings = await MarketService.getListings(limit, offset);
      res.json({ success: true, data: listings } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async getMyListings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const listings = await MarketService.getMyListings(req.user!.countryId);
      res.json({ success: true, data: listings } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transactions = await MarketService.getTransactionHistory(req.user!.countryId);
      res.json({ success: true, data: transactions } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async listItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { itemName, quantity, pricePerUnit, resourceType } = req.body as {
        itemName: string; quantity: number; pricePerUnit: number; resourceType?: ResourceType;
      };
      const listing = await MarketService.listItem(req.user!.countryId, {
        itemName, quantity, pricePerUnit, resourceType,
      });

      res.status(201).json({ success: true, data: listing, message: 'Item listed successfully' } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async buyItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await MarketService.buyItem(req.user!.countryId, req.params.listingId);
      res.json({
        success: true,
        data: result,
        message: `Purchase complete. Market tax: ${result.marketTax.toFixed(2)}`,
      } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async cancelListing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const listing = await MarketService.cancelListing(req.user!.countryId, req.params.listingId);
      res.json({ success: true, data: listing, message: 'Listing cancelled, resources returned' } satisfies ApiResponse);
    } catch (err) { next(err); }
  },

  async getDynamicPrice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const type = req.params.resourceType as ResourceType;
      if (!VALID_RESOURCE_TYPES.includes(type)) {
        res.status(400).json({ success: false, message: 'Invalid resource type' } satisfies ApiResponse);
        return;
      }
      const basePrice = parseFloat((req.query.base as string) ?? '100');
      const price = await MarketService.getDynamicPrice(type, basePrice);
      res.json({ success: true, data: { type, price } } satisfies ApiResponse);
    } catch (err) { next(err); }
  },
};

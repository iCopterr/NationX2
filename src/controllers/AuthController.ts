// ============================================================
// Auth Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { AuthService } from '../services/AuthService';
import { ApiResponse } from '../types';
import { extractErrors } from './helpers';

export const authValidation = {
  register: [
    body('username').trim().isLength({ min: 3, max: 32 }).withMessage('Username must be 3-32 chars'),
    body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 chars'),
    body('countryName').trim().isLength({ min: 2, max: 64 }).withMessage('Country name must be 2-64 chars'),
  ],
  login: [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
};

export const AuthController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { username, email, password, countryName, flagEmoji } = req.body as {
        username: string; email: string; password: string; countryName: string; flagEmoji?: string;
      };
      const result = await AuthService.register({ username, email, password, countryName, flagEmoji });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Registration successful',
      } satisfies ApiResponse);
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: extractErrors(errors) } satisfies ApiResponse);
        return;
      }

      const { email, password } = req.body as { email: string; password: string };
      const result = await AuthService.login(email, password);

      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      if (err instanceof Error && err.message === 'Invalid credentials') {
        res.status(401).json({ success: false, message: 'Invalid credentials' } satisfies ApiResponse);
        return;
      }
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: req.user } satisfies ApiResponse);
    } catch (err) {
      next(err);
    }
  },
};

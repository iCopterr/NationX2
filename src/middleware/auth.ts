// ============================================================
// Auth Middleware
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { JwtPayload } from '../types';

// Extend Express Request to carry authenticated payload
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Authorization token required' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = AuthService.verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/** Require req.user.countryId to match :countryId param */
export function ownCountryOnly(req: Request, res: Response, next: NextFunction): void {
  const paramId = req.params.countryId;
  if (paramId && req.user?.countryId !== paramId) {
    res.status(403).json({ success: false, message: 'Access denied — not your country' });
    return;
  }
  next();
}

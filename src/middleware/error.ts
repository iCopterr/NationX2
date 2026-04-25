// ============================================================
// Error Handling Middleware
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    } satisfies ApiResponse);
    return;
  }

  // Validation errors
  if (err.message.includes('violates')) {
    res.status(409).json({ success: false, message: 'Data conflict: ' + err.message } satisfies ApiResponse);
    return;
  }

  console.error('[Server] Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  } satisfies ApiResponse);
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` } satisfies ApiResponse);
}

// ============================================================
// Express App
// ============================================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { errorHandler, notFound } from './middleware/error';

export function createApp() {
  const app = express();

  // ── Security ─────────────────────────────────────────────────
  app.use(helmet());
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // ── Body parsing ─────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Health check ─────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), game: 'NationX' });
  });

  // ── API routes ───────────────────────────────────────────────
  app.use('/api/v1', routes);

  // ── Error handling ───────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

// ============================================================
// Server Entry Point
// ============================================================
import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { config } from './config';
import { pool } from './database/pool';
import { EconomyLoopService } from './services/EconomyLoopService';
import { GlobalEventService } from './services/GlobalEventService';

async function main() {
  // ── DB connectivity check ─────────────────────────────────────
  try {
    const client = await pool.connect();
    client.release();
    console.log('[DB] ✅ Database connected');
  } catch (err) {
    console.error('[DB] ❌ Cannot connect to database:', err);
    process.exit(1);
  }

  // ── Start HTTP server ─────────────────────────────────────────
  const app = createApp();
  const server = app.listen(config.server.port, () => {
    console.log(`\n🌍 NationX Server running on port ${config.server.port}`);
    console.log(`   Mode: ${config.server.env}`);
    console.log(`   API:  http://localhost:${config.server.port}/api/v1`);
    console.log(`   Health: http://localhost:${config.server.port}/health\n`);
  });

  // ── Economy Loop ─────────────────────────────────────────────
  EconomyLoopService.startScheduler();

  // ── Global Event Scheduler (check every 5 ticks) ─────────────
  setInterval(async () => {
    try {
      await GlobalEventService.triggerRandomEvent();
      await GlobalEventService.cleanupExpiredEvents();
    } catch (err) {
      console.error('[Events] Scheduler error:', err);
    }
  }, config.game.tickIntervalMs * 5);

  // ── Graceful shutdown ─────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
    server.close(async () => {
      await pool.end();
      console.log('[Server] ✅ Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});

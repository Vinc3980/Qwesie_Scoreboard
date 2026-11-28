import { Router, Request, Response } from 'express';
import { pingDatabase } from '../config/database.js';
import { snapshotMetrics } from '../utils/perfMetrics.js';
import { env } from '../config/env.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  const db = await pingDatabase();
  res.json({
    status: db.ok ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: db.ok ? 'connected' : `error: ${db.error}`,
    databaseLatencyMs: db.latencyMs,
    runtime: {
      node: process.version,
      env: env.NODE_ENV,
      region: process.env.RENDER_REGION || process.env.VERCEL_REGION || null,
      instance: process.env.RENDER_INSTANCE_ID || null,
    },
  });
});

/**
 * p50/p95/p99 per normalised route, collected in-process. Use this to find the
 * slowest endpoints without an external APM. Disabled payload for production
 * dashboards unless DIAGNOSTICS is on, but always cheap to read.
 */
healthRouter.get('/metrics', (req: Request, res: Response) => {
  if (env.NODE_ENV === 'production' && !env.DIAGNOSTICS && req.query.allow !== '1') {
    res.status(404).json({ success: false, error: { message: 'Metrics disabled (set DIAGNOSTICS=true)' } });
    return;
  }
  res.json(snapshotMetrics());
});

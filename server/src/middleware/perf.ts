import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { recordRequest } from '../utils/perfMetrics.js';

/**
 * Adds a Server-Timing entry and a response-time header to every response, and
 * records the duration for /api/v1/health/metrics. Request logs include the
 * duration; slow requests are logged even when verbose logging is off.
 */
export function perfMiddleware(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  let finished = false;

  const originalWriteHead = res.writeHead.bind(res) as any;
  res.writeHead = function patchedWriteHead(...args: any[]) {
    if (!res.headersSent) {
      const ms = elapsedMs(started);
      try {
        res.setHeader('Server-Timing', `app;dur=${ms.toFixed(1)};desc="request"`);
        res.setHeader('X-Response-Time', `${ms.toFixed(1)}ms`);
      } catch {
        /* headers already flushed by an earlier handler */
      }
    }
    return originalWriteHead(...args);
  } as any;

  const onFinish = () => {
    if (finished) return;
    finished = true;
    const ms = elapsedMs(started);
    const route = (req as any).route?.path ? `${req.baseUrl || ''}${(req as any).route.path}` : req.path;
    recordRequest(req.method, route || req.path, req.originalUrl || req.url, ms, res.statusCode);

    const line = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${ms.toFixed(1)}ms`;
    if (ms >= env.PERF_SLOW_MS) logger.warn(`SLOW ${line}`);
    else if (env.PERF_LOG || (req.originalUrl || req.url || '').startsWith('/api')) logger.info(line);
    else logger.debug(line);
  };

  res.once('finish', onFinish);
  res.once('close', onFinish);
  next();
}

function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

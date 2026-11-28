import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const diagnostics = env.DIAGNOSTICS;

export const prisma =
  globalThis.prisma ||
  new PrismaClient({
    log: diagnostics
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ]
      : ['error'],
    errorFormat: env.NODE_ENV === 'production' ? 'minimal' : 'pretty',
  });

if (diagnostics) {
  // Query durations are only collected when DIAGNOSTICS=true. This is the
  // measurement switch used for docs/perf/BASELINE.md and AFTER.md.
  (prisma as any).$on('query', (event: any) => {
    const sql = String(event.query || '').replace(/\s+/g, ' ').slice(0, 240);
    logger.info(`[prisma] ${Number(event.duration || 0).toFixed(1)}ms ${sql}`);
  });
  (prisma as any).$on('warn', (event: any) => logger.warn(`[prisma] ${event.message}`));
  (prisma as any).$on('error', (event: any) => logger.error(`[prisma] ${event.message}`));
}

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

const RETRYABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034']);
const RETRYABLE_TEXT = /ECONNRESET|ETIMEDOUT|EPIPE|Connection terminated|Can't reach database server|Timed out fetching a new connection/i;

export function isRetryableDbError(error: unknown): boolean {
  const e = error as any;
  const code = String(e?.code || e?.errorCode || '');
  if (RETRYABLE_CODES.has(code)) return true;
  const message = String(e?.message || e || '');
  return RETRYABLE_TEXT.test(message);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs a database operation and retries exactly once on a connection-level
 * error (Neon cold start, PgBouncer reconnect, pool timeout). Application
 * errors (validation, unique constraint, etc.) are never retried.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, label = 'query'): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isRetryableDbError(error)) throw error;
    logger.warn(`[db] retrying ${label} after connection error: ${(error as any)?.message || error}`);
    await sleep(200);
    return fn();
  }
}

export async function connectDatabase(): Promise<void> {
  try {
    await withDbRetry(() => prisma.$connect(), 'connect');
    logger.info('PostgreSQL connected via Prisma');
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL database:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected gracefully');
  } catch (error) {
    logger.error('Error disconnecting database:', error);
  }
}

/** Health check ping that also reports round-trip latency. */
export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = process.hrtime.bigint();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100 };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100,
      error: (error as Error).message,
    };
  }
}

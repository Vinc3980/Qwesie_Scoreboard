import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { logger } from './logger.js';

let timer: NodeJS.Timeout | null = null;

/**
 * Optional keep-warm ping. Neon suspends an idle compute after a few minutes;
 * the first query after that pays a multi-second cold start. Enable this only
 * on match/event days (KEEPWARM_ENABLED=true) so it does not burn compute
 * hours the rest of the month.
 */
export function startKeepWarm(): void {
  if (!env.KEEPWARM_ENABLED) {
    logger.info('Keep-warm disabled (set KEEPWARM_ENABLED=true on event days).');
    return;
  }
  if (timer) return;

  const intervalMs = Math.max(1, Number(env.KEEPWARM_INTERVAL_MINUTES || 4)) * 60_000;
  const ping = async () => {
    const started = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.debug(`[keepwarm] database awake (${Date.now() - started}ms)`);
    } catch (error) {
      logger.warn(`[keepwarm] ping failed: ${(error as Error)?.message || error}`);
    }
  };

  void ping();
  timer = setInterval(ping, intervalMs);
  timer.unref();
  logger.info(`Keep-warm enabled: SELECT 1 every ${Math.round(intervalMs / 60_000)} min.`);
}

export function stopKeepWarm(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

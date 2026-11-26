import { prisma } from '../config/database.js';
import { logger } from './logger.js';

export type BootstrapStatus = {
  needsBootstrap: boolean;
  /**
   * Kept for API compatibility with older clients. Always false: first-run
   * bootstrap no longer requires a setup token.
   */
  setupTokenRequired: boolean;
};

let warned = false;

/**
 * First-run bootstrap: when no active ADMIN exists, the first visitor can
 * create the admin account. There is intentionally no setup token.
 */
export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  try {
    const admin = await prisma.user.findFirst({
      where: { role: { name: 'ADMIN' }, isActive: true },
      select: { id: true },
    });
    const needsBootstrap = !admin;
    if (needsBootstrap && !warned) {
      warned = true;
      logger.warn('First-run setup is open (no admin exists yet). Create the admin account now.');
    }
    return { needsBootstrap, setupTokenRequired: false };
  } catch {
    // DB may be unavailable yet; assume bootstrap is needed but don't leak state.
    return { needsBootstrap: true, setupTokenRequired: false };
  }
}

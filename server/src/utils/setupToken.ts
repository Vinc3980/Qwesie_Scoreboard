import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let generatedSetupToken: string | null = null;
let logged = false;

export async function ensureSetupTokenIfNeeded(): Promise<{ needsBootstrap: boolean; setupTokenRequired: boolean }> {
  try {
    const admin = await prisma.user.findFirst({ where: { role: { name: 'ADMIN' }, isActive: true }, select: { id: true } });
    const needsBootstrap = !admin;
    if (!needsBootstrap) return { needsBootstrap: false, setupTokenRequired: false };
    if (!generatedSetupToken) generatedSetupToken = crypto.randomBytes(18).toString('hex');
    const setupTokenRequired = true; // protected first-run bootstrap
    if (!logged) {
      logged = true;
      logger.info(`First-run bootstrap required. Setup token (use if prompted): ${generatedSetupToken}`);
      if (env.BOOTSTRAP_SETUP_TOKEN) logger.info('BOOTSTRAP_SETUP_TOKEN env var is set and will also be accepted.');
    }
    return { needsBootstrap, setupTokenRequired };
  } catch {
    // DB may be unavailable yet; assume bootstrap needed but don't leak state
    if (!generatedSetupToken) generatedSetupToken = crypto.randomBytes(18).toString('hex');
    return { needsBootstrap: true, setupTokenRequired: true };
  }
}

export function validateSetupToken(token: string | undefined | null): boolean {
  const provided = String(token || '').trim();
  if (env.BOOTSTRAP_SETUP_TOKEN && provided && provided === env.BOOTSTRAP_SETUP_TOKEN) return true;
  if (generatedSetupToken && provided && provided === generatedSetupToken) return true;
  return false;
}


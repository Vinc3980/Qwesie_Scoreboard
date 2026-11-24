import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { toRole } from '../utils/authSecurity.js';

export const DEV_USER_ID = 'usr_dev_scorer';

let devUserReady = false;

export async function ensureDevUser(): Promise<void> {
  if (devUserReady || env.NODE_ENV === 'production') return;
  if (!env.DEV_AUTO_LOGIN) return;
  try {
    await prisma.user.upsert({
      where: { id: DEV_USER_ID },
      update: { isActive: true, tokenVersion: 0, mustChangePassword: false },
      create: {
        id: DEV_USER_ID,
        email: 'dev@qwesie.local',
        username: 'dev',
        passwordHash: 'dev-only-no-password',
        displayName: 'Development Scorer',
        isActive: true,
        tokenVersion: 0,
        mustChangePassword: false,
      },
    });
    devUserReady = true;
  } catch {
    devUserReady = false;
  }
}

export interface AuthUser {
  id: string;
  role: 'ADMIN' | 'SCORER' | 'VIEWER';
  username?: string;
  tokenVersion?: number;
  mustChangePassword?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function readToken(req: Request): string | null {
  const cookieToken = (req as any).cookies?.[env.JWT_COOKIE_NAME];
  if (cookieToken) return String(cookieToken);
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7);
  return null;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      if (decoded?.id) {
        const u = await prisma.user.findUnique({ where: { id: String(decoded.id) }, include: { role: true } });
        if (u && u.isActive) {
          const role = toRole(u.role?.name);
          const tv = Number(decoded.tokenVersion ?? -1);
          if (tv === Number(u.tokenVersion ?? 0)) {
            req.user = { id: u.id, role, username: u.username, tokenVersion: u.tokenVersion, mustChangePassword: !!u.mustChangePassword };
          }
        }
      }
    } catch {
      // invalid token / db unavailable -> unauthenticated
    }
  }

  // Dev convenience only when explicitly enabled
  if (!req.user && env.NODE_ENV !== 'production' && env.DEV_AUTO_LOGIN) {
    if (!devUserReady) await ensureDevUser();
    req.user = { id: DEV_USER_ID, role: 'SCORER', username: 'dev', tokenVersion: 0, mustChangePassword: false };
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'AUTH_REQUIRED' }, timestamp: new Date().toISOString() });
  next();
}

export function requireRoles(roles: Array<'ADMIN' | 'SCORER' | 'VIEWER'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'AUTH_REQUIRED' }, timestamp: new Date().toISOString() });
    if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, error: { message: 'Insufficient permissions' }, timestamp: new Date().toISOString() });
    next();
  };
}


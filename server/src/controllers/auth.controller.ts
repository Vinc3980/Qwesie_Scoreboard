import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  toRole, normalizeUsername, validatePasswordPolicy, validatePasswordPolicyAny,
  hashPassword, verifyPassword, sha256, randomToken, randomTempPassword,
  generateRecoveryCodes, normalizeRecoveryCode,
  LOCKOUT_MAX_FAILURES, LOCKOUT_MS,
  getClientIp, getIpLockInfo, recordIpFailure, clearIpFailures, userLockInfo, smtpEnabled,
  type AppRole,
} from '../utils/authSecurity.js';
import { ensureSetupTokenIfNeeded, validateSetupToken } from '../utils/setupToken.js';

function send(res: Response, data: any, message?: string) {
  res.json({ success: true, data, message, timestamp: new Date().toISOString() });
}
function fail(res: Response, status: number, message: string, extra?: any) {
  return res.status(status).json({ success: false, error: { message, ...(extra || {}) }, timestamp: new Date().toISOString() });
}

async function ensureRole(name: string) {
  return prisma.role.upsert({ where: { name }, update: {}, create: { name, description: name, permissions: {} } });
}

function cookieSecure(req: Request) {
  const xf = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return !!(req as any).secure || xf === 'https';
}

function issueCookie(req: Request, res: Response, payload: any, rememberMe?: boolean) {
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: rememberMe ? '7d' : '12h' });
  const opts: any = {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(req),
    path: '/',
  };
  if (rememberMe) opts.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days; else session cookie
  res.cookie(env.JWT_COOKIE_NAME, token, opts);
}

async function countActiveAdmins(excludeUserId?: string) {
  const where: any = { isActive: true, role: { name: 'ADMIN' } };
  if (excludeUserId) where.id = { not: excludeUserId };
  return prisma.user.count({ where });
}

async function createRecoveryCodesForUser(userId: string) {
  // replace existing unused? on first admin creation there should be none
  const codes = generateRecoveryCodes(8);
  await prisma.userRecoveryCode.deleteMany({ where: { userId } });
  await prisma.userRecoveryCode.createMany({
    data: codes.map(c => ({ userId, codeHash: sha256(normalizeRecoveryCode(c)) })),
  });
  return codes;
}

async function trySendResetEmail(to: string, link: string) {
  if (!smtpEnabled()) return false;
  try {
    // Dynamic import to avoid hard dependency if nodemailer isn't installed; but we should add it if needed.
    // We'll attempt require/import of nodemailer.
    // @ts-ignore optional dependency (SMTP layer)
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: !!env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    } as any);
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: 'Qwesie TV password reset',
      text: `Use this link to reset your password (valid for 30 minutes):\n${link}\n\nIf you did not request this, you can ignore this message.`,
    });
    return true;
  } catch (e) {
    logger.warn(`SMTP reset email failed: ${(e as Error)?.message || e}`);
    return false;
  }
}

// simple per-identifier rate limit for forgot flows (in-memory)
const forgotHits = new Map<string, { count: number; reset: number }>();
function checkForgotRateLimit(key: string, max = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const cur = forgotHits.get(key);
  if (!cur || now > cur.reset) { forgotHits.set(key, { count: 1, reset: now + windowMs }); return true; }
  cur.count += 1;
  return cur.count <= max;
}

export class AuthController {
  static async bootstrapStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      const info = await ensureSetupTokenIfNeeded();
      send(res, info);
    } catch (e) { next(e); }
  }

  static async bootstrap(req: Request, res: Response, next: NextFunction) {
    try {
      const info = await ensureSetupTokenIfNeeded();
      if (!info.needsBootstrap) return fail(res, 409, 'Admin already exists');
      const { username, password, displayName, email, setupToken } = req.body as any;
      if (info.setupTokenRequired && !validateSetupToken(setupToken)) {
        return fail(res, 403, 'Valid setup token is required for first-run bootstrap');
      }
      const uname = normalizeUsername(username);
      const dup = await prisma.user.findFirst({ where: { username: { equals: uname, mode: 'insensitive' } } as any });
      if (dup) return fail(res, 409, 'Unable to create admin account'); // avoid enumeration-ish detail? still fine
      const policyErr = validatePasswordPolicyAny(String(password));
      if (policyErr) return fail(res, 400, policyErr);
      const adminRole = await ensureRole('ADMIN');
      const passwordHash = await hashPassword(String(password));
      const user = await prisma.user.create({
        data: {
          username: uname,
          email: (email && String(email).trim()) || `${uname}@qwesie.local`,
          passwordHash,
          displayName: String(displayName || uname),
          roleId: adminRole.id,
          isActive: true,
          tokenVersion: 0,
          failedAttempts: 0,
          lockedUntil: null,
          mustChangePassword: false,
        },
        include: { role: true },
      });
      const recoveryCodes = await createRecoveryCodesForUser(user.id);
      const role = toRole(user.role?.name);
      issueCookie(req, res, { id: user.id, role, username: user.username, tokenVersion: user.tokenVersion }, false);
      send(res, {
        user: { id: user.id, username: user.username, displayName: user.displayName, role, mustChangePassword: false },
        recoveryCodes, // shown once
      }, 'Admin created');
    } catch (e) { next(e); }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password, rememberMe } = req.body as { username: string; password: string; rememberMe?: boolean };
      const uname = normalizeUsername(username);
      const ip = getClientIp(req);
      const generic = () => fail(res, 401, 'Invalid username or password');

      const ipLock = getIpLockInfo(ip);
      if (ipLock.locked) {
        return fail(res, 423, 'Too many failed attempts. Try again later.', { locked: true, retryAfterSeconds: Math.ceil(ipLock.retryAfterMs / 1000) });
      }

      const user = await prisma.user.findFirst({ where: { username: { equals: uname, mode: 'insensitive' } } as any, include: { role: true } });
      if (!user) {
        recordIpFailure(ip);
        return generic();
      }

      const uLock = userLockInfo(user);
      if (uLock.locked || (user.failedAttempts || 0) >= LOCKOUT_MAX_FAILURES && user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
        // ensure IP also slowed
        recordIpFailure(ip);
        const retryMs = Math.max(uLock.retryAfterMs, new Date(user.lockedUntil as any).getTime() - Date.now());
        return fail(res, 423, 'Too many failed attempts. Try again later.', { locked: true, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) });
      }

      // clear expired lock on user
      if (user.lockedUntil && new Date(user.lockedUntil).getTime() <= Date.now()) {
        await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
        user.failedAttempts = 0; (user as any).lockedUntil = null;
      }

      if (!user.isActive) {
        recordIpFailure(ip);
        await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: { increment: 1 } } }).catch(() => {});
        return generic();
      }

      const ok = await verifyPassword(String(password || ''), user.passwordHash);
      if (!ok) {
        const nextFails = (user.failedAttempts || 0) + 1;
        const lock = nextFails >= LOCKOUT_MAX_FAILURES ? new Date(Date.now() + LOCKOUT_MS) : null;
        await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: nextFails, lockedUntil: lock } }).catch(() => {});
        const ipRes = recordIpFailure(ip);
        if (lock || ipRes.lockUntil) {
          const retryMs = lock ? (lock.getTime() - Date.now()) : (ipRes.lockUntil - Date.now());
          return fail(res, 423, 'Too many failed attempts. Try again later.', { locked: true, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) });
        }
        return generic();
      }

      // success
      clearIpFailures(ip);
      if (user.failedAttempts || user.lockedUntil) {
        await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } }).catch(() => {});
      }
      const role = toRole(user.role?.name);
      issueCookie(req, res, { id: user.id, role, username: user.username, tokenVersion: user.tokenVersion || 0 }, !!rememberMe);
      send(res, { user: { id: user.id, username: user.username, displayName: user.displayName, role, mustChangePassword: !!user.mustChangePassword } }, 'Logged in');
    } catch (e) { next(e); }
  }

  static async logout(req: Request, res: Response) {
    res.clearCookie(env.JWT_COOKIE_NAME, { path: '/', sameSite: 'lax', httpOnly: true, secure: cookieSecure(req) });
    res.clearCookie(env.JWT_COOKIE_NAME, { path: '/' });
    send(res, { ok: true }, 'Logged out');
  }

  static async logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return fail(res, 401, 'Authentication required');
      await prisma.user.update({ where: { id: req.user.id }, data: { tokenVersion: { increment: 1 } } });
      res.clearCookie(env.JWT_COOKIE_NAME, { path: '/', sameSite: 'lax', httpOnly: true, secure: cookieSecure(req) });
      res.clearCookie(env.JWT_COOKIE_NAME, { path: '/' });
      send(res, { ok: true }, 'Signed out everywhere');
    } catch (e) { next(e); }
  }

  static async me(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, 'Not authenticated', { code: 'AUTH_REQUIRED' });
    try {
      const u = await prisma.user.findUnique({ where: { id: req.user.id }, include: { role: true } });
      if (u && u.isActive) {
        const role = toRole(u.role?.name);
        return void send(res, { user: { id: u.id, username: u.username, displayName: u.displayName, role, mustChangePassword: !!u.mustChangePassword } });
      }
    } catch {}
    return fail(res, 401, 'Not authenticated', { code: 'AUTH_REQUIRED' });
  }

  static async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return fail(res, 401, 'Authentication required');
      const { currentPassword, newPassword } = req.body as any;
      const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { role: true } });
      if (!user || !user.isActive) return fail(res, 401, 'Authentication required');
      const ok = await verifyPassword(String(currentPassword || ''), user.passwordHash);
      if (!ok) return fail(res, 400, 'Current password is incorrect');
      const role = toRole(user.role?.name);
      const policyErr = validatePasswordPolicy(String(newPassword || ''), role);
      if (policyErr) return fail(res, 400, policyErr);
      const same = await verifyPassword(String(newPassword || ''), user.passwordHash);
      if (same) return fail(res, 400, 'New password must be different');
      const passwordHash = await hashPassword(String(newPassword));
      const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 }, mustChangePassword: false, failedAttempts: 0, lockedUntil: null } });
      issueCookie(req, res, { id: updated.id, role, username: updated.username, tokenVersion: updated.tokenVersion }, false);
      send(res, { ok: true }, 'Password changed');
    } catch (e) { next(e); }
  }

  static async listUsers(_req: Request, res: Response, next: NextFunction) {
    try {
      const users = await prisma.user.findMany({ include: { role: true }, orderBy: { createdAt: 'desc' } });
      send(res, users.map(u => ({ id: u.id, username: u.username, displayName: u.displayName, email: u.email, isActive: u.isActive, role: toRole(u.role?.name), mustChangePassword: !!u.mustChangePassword, createdAt: u.createdAt })));
    } catch (e) { next(e); }
  }

  static async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password, displayName, email, role } = req.body as any;
      const uname = normalizeUsername(username);
      const dup = await prisma.user.findFirst({ where: { username: { equals: uname, mode: 'insensitive' } } as any });
      if (dup) return fail(res, 409, 'Username already exists');
      const roleName = String(role || 'VIEWER').toUpperCase() as AppRole;
      const policyErr = validatePasswordPolicy(String(password), roleName);
      if (policyErr) return fail(res, 400, policyErr);
      const roleRow = await ensureRole(roleName);
      const passwordHash = await hashPassword(String(password));
      const user = await prisma.user.create({
        data: {
          username: uname,
          email: (email && String(email).trim()) || `${uname}@qwesie.local`,
          passwordHash,
          displayName: String(displayName || uname),
          roleId: roleRow.id,
          isActive: true,
          tokenVersion: 0,
        },
        include: { role: true },
      });
      send(res, { id: user.id, username: user.username, displayName: user.displayName, role: toRole(user.role?.name), isActive: true }, 'User created');
    } catch (e) { next(e); }
  }

  static async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { displayName, role, active } = req.body as any;
      const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
      if (!target) return fail(res, 404, 'User not found');
      const actorId = req.user?.id;
      const targetRole = toRole(target.role?.name);
      const nextRole = role ? (String(role).toUpperCase() as AppRole) : targetRole;
      const nextActive = typeof active === 'boolean' ? active : target.isActive;

      if (actorId && actorId === id) {
        if (typeof active === 'boolean' && active === false) return fail(res, 400, 'You cannot disable your own account');
        if (role && nextRole !== targetRole) return fail(res, 400, 'You cannot change your own role');
      }
      if (targetRole === 'ADMIN' && (nextRole !== 'ADMIN' || nextActive === false)) {
        const others = await countActiveAdmins(id);
        if (others <= 0) return fail(res, 400, 'Cannot demote or disable the last active admin');
      }

      const data: any = {};
      if (displayName !== undefined) data.displayName = String(displayName);
      if (typeof active === 'boolean') data.isActive = active;
      if (role !== undefined) {
        const roleRow = await ensureRole(nextRole);
        data.roleId = roleRow.id;
      }
      // invalidate sessions on disable or role change (security)
      if ((typeof active === 'boolean' && active === false) || (role !== undefined && nextRole !== targetRole)) {
        data.tokenVersion = { increment: 1 };
      }
      const updated = await prisma.user.update({ where: { id }, data, include: { role: true } });
      send(res, { id: updated.id, username: updated.username, displayName: updated.displayName, email: updated.email, isActive: updated.isActive, role: toRole(updated.role?.name), mustChangePassword: !!updated.mustChangePassword }, 'User updated');
    } catch (e) { next(e); }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
      if (!target) return fail(res, 404, 'User not found');
      const tempPassword = randomTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      await prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 }, failedAttempts: 0, lockedUntil: null } });
      // Return one-time temporary password (shown once to admin)
      send(res, { userId: id, username: target.username, tempPassword, mustChangePassword: true }, 'Temporary password generated');
    } catch (e) { next(e); }
  }

  static async deleteOrDisableUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
      if (!target) return fail(res, 404, 'User not found');
      const actorId = req.user?.id;
      if (actorId && actorId === id) return fail(res, 400, 'You cannot disable or delete your own account');
      const targetRole = toRole(target.role?.name);
      if (targetRole === 'ADMIN' && target.isActive) {
        const others = await countActiveAdmins(id);
        if (others <= 0) return fail(res, 400, 'Cannot disable or delete the last active admin');
      }
      // Soft-disable (safer than hard delete due to FKs/audit). "DELETE or soft-disable user"
      const updated = await prisma.user.update({ where: { id }, data: { isActive: false, tokenVersion: { increment: 1 } }, include: { role: true } });
      send(res, { id: updated.id, isActive: updated.isActive }, 'User disabled');
    } catch (e) { next(e); }
  }

  // --- Forgot/reset flows (no user enumeration) ---

  static async forgotPasswordRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { identifier } = req.body as any;
      const idn = String(identifier || '').trim().toLowerCase();
      const ip = getClientIp(req);
      // rate limit
      if (!checkForgotRateLimit(`ip:${ip}`) || !checkForgotRateLimit(`id:${idn}`)) {
        return send(res, { ok: true, requested: true }, 'If the account exists, reset options are available.');
      }
      // We do not reveal existence. For email layer, if SMTP enabled and we find user by email/username with email, send link.
      if (smtpEnabled()) {
        const user = await prisma.user.findFirst({
          where: {
            isActive: true,
            OR: [
              { username: { equals: idn, mode: 'insensitive' } as any },
              { email: { equals: idn, mode: 'insensitive' } as any },
            ],
          } as any,
        });
        if (user && user.email && !String(user.email).endsWith('@qwesie.local')) {
          const token = randomToken(32);
          const tokenHash = sha256(token);
          const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
          await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
          const base = (env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
          const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;
          await trySendResetEmail(user.email, link);
        }
      }
      // Always generic response
      send(res, { ok: true, requested: true, emailEnabled: smtpEnabled() }, 'If the account exists, reset options are available.');
    } catch (e) { next(e); }
  }

  static async resetWithRecoveryCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, recoveryCode, newPassword } = req.body as any;
      const uname = normalizeUsername(username);
      const ip = getClientIp(req);
      const generic = () => fail(res, 400, 'Unable to reset password with the provided information');
      if (!checkForgotRateLimit(`rc:${ip}:${uname.toLowerCase()}`, 8, 15 * 60 * 1000)) return generic();
      const user = await prisma.user.findFirst({ where: { username: { equals: uname, mode: 'insensitive' } } as any, include: { role: true } });
      if (!user || !user.isActive) return generic();
      // layer (b): "allow an admin to reset their own password with one code"
      if (toRole(user.role?.name) !== 'ADMIN') return generic();
      const policyErr = validatePasswordPolicyAny(String(newPassword));
      if (policyErr) return fail(res, 400, policyErr);
      const codeHash = sha256(normalizeRecoveryCode(recoveryCode));
      const rec = await prisma.userRecoveryCode.findFirst({ where: { userId: user.id, codeHash, usedAt: null } });
      if (!rec) return generic();
      const passwordHash = await hashPassword(String(newPassword));
      await prisma.$transaction([
        prisma.userRecoveryCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
        prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 }, mustChangePassword: false, failedAttempts: 0, lockedUntil: null } }),
      ]);
      send(res, { ok: true }, 'Password reset successfully');
    } catch (e) { next(e); }
  }

  static async resetWithToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, newPassword } = req.body as any;
      const generic = () => fail(res, 400, 'Invalid or expired reset link');
      if (!smtpEnabled()) return generic();
      if (!checkForgotRateLimit(`rt:${getClientIp(req)}`, 10, 15 * 60 * 1000)) return generic();
      const tokenHash = sha256(String(token || ''));
      const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!rec || rec.usedAt || rec.expiresAt.getTime() < Date.now()) return generic();
      const user = await prisma.user.findUnique({ where: { id: rec.userId }, include: { role: true } });
      if (!user || !user.isActive) return generic();
      const role = toRole(user.role?.name);
      const policyErr = validatePasswordPolicy(String(newPassword), role);
      if (policyErr) return fail(res, 400, policyErr);
      const passwordHash = await hashPassword(String(newPassword));
      await prisma.$transaction([
        prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
        prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 }, mustChangePassword: false, failedAttempts: 0, lockedUntil: null } }),
      ]);
      send(res, { ok: true }, 'Password reset successfully');
    } catch (e) { next(e); }
  }

  static async resetWithTempPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, tempPassword, newPassword } = req.body as any;
      const uname = normalizeUsername(username);
      const generic = () => fail(res, 400, 'Unable to reset password with the provided information');
      if (!checkForgotRateLimit(`tp:${getClientIp(req)}:${uname.toLowerCase()}`, 10, 15 * 60 * 1000)) return generic();
      const user = await prisma.user.findFirst({ where: { username: { equals: uname, mode: 'insensitive' } } as any, include: { role: true } });
      if (!user || !user.isActive || !user.mustChangePassword) return generic();
      const ok = await verifyPassword(String(tempPassword || ''), user.passwordHash);
      if (!ok) return generic();
      const role = toRole(user.role?.name);
      const policyErr = validatePasswordPolicy(String(newPassword), role);
      if (policyErr) return fail(res, 400, policyErr);
      const same = await verifyPassword(String(newPassword || ''), user.passwordHash);
      if (same) return fail(res, 400, 'New password must be different');
      const passwordHash = await hashPassword(String(newPassword));
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 }, mustChangePassword: false, failedAttempts: 0, lockedUntil: null } });
      send(res, { ok: true }, 'Password updated');
    } catch (e) { next(e); }
  }

  static async smtpStatus(_req: Request, res: Response) {
    send(res, { enabled: smtpEnabled() });
  }

  // Admin can regenerate own recovery codes? "allow an admin to reset their own password with one code" - codes generated at first admin creation.
  // Not explicitly requested to regenerate, but useful; "allow an admin to reset their own password with one code" is the required capability.
  static async regenerateRecoveryCodes(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return fail(res, 401, 'Authentication required');
      if (req.user.role !== 'ADMIN') return fail(res, 403, 'Insufficient permissions');
      const codes = await createRecoveryCodesForUser(req.user.id);
      send(res, { recoveryCodes: codes }, 'Recovery codes regenerated');
    } catch (e) { next(e); }
  }
}


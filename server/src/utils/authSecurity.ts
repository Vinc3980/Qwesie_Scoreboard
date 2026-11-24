import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export type AppRole = 'ADMIN' | 'SCORER' | 'VIEWER';

export function toRole(roleName?: string | null): AppRole {
  const r = (roleName || 'VIEWER').toUpperCase();
  return (['ADMIN', 'SCORER', 'VIEWER'].includes(r) ? r : 'VIEWER') as AppRole;
}

export function normalizeUsername(u: string) {
  return String(u || '').trim();
}

export function normalizeIdentifier(u: string) {
  return String(u || '').trim().toLowerCase();
}

export function isNumericPin(pw: string) {
  return /^\d+$/.test(pw);
}

export function validatePasswordPolicy(password: string, role: AppRole): string | null {
  const pw = String(password || '');
  if (!pw) return 'Password is required';
  if (env.ALLOW_SCORER_PIN && (role === 'SCORER' || role === 'VIEWER') && isNumericPin(pw)) {
    if (pw.length < 6) return 'PIN must be at least 6 digits';
    return null;
  }
  if (pw.length < 8) return 'Password must be at least 8 characters';
  return null;
}

export function validatePasswordPolicyAny(password: string): string | null {
  const pw = String(password || '');
  if (!pw) return 'Password is required';
  if (env.ALLOW_SCORER_PIN && isNumericPin(pw)) {
    if (pw.length < 6) return 'PIN must be at least 6 digits';
    return null;
  }
  if (pw.length < 8) return 'Password must be at least 8 characters';
  return null;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  try { return await bcrypt.compare(password, hash); } catch { return false; }
}

export function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomTempPassword() {
  // 12 chars, URL-safe-ish, easy to copy
  return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}

export function generateRecoveryCodes(count = 8) {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // format: XXXX-XXXX-XXXX (alnum, no ambiguous chars)
    const raw = crypto.randomBytes(8).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const clean = raw.replace(/[O0I1]/g, 'A').slice(0, 12).padEnd(12, 'A');
    codes.push(`${clean.slice(0,4)}-${clean.slice(4,8)}-${clean.slice(8,12)}`);
  }
  return codes;
}

export function normalizeRecoveryCode(code: string) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

type IpState = { failures: number; lockUntil: number };
const ipStates = new Map<string, IpState>();

export function getClientIp(req: any): string {
  const xf = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.ip || req.socket?.remoteAddress || 'unknown');
}

export function getIpLockInfo(ip: string) {
  const s = ipStates.get(ip);
  if (!s) return { locked: false, retryAfterMs: 0, failures: 0 };
  if (s.lockUntil && s.lockUntil > Date.now()) return { locked: true, retryAfterMs: s.lockUntil - Date.now(), failures: s.failures };
  if (s.lockUntil && s.lockUntil <= Date.now()) { ipStates.delete(ip); return { locked: false, retryAfterMs: 0, failures: 0 }; }
  return { locked: false, retryAfterMs: 0, failures: s.failures };
}

export function recordIpFailure(ip: string) {
  const now = Date.now();
  const cur = ipStates.get(ip);
  const prev = cur && cur.lockUntil > now ? cur : (cur && cur.lockUntil <= now ? undefined : cur);
  const failures = (prev?.failures || 0) + 1;
  const lockUntil = failures >= LOCKOUT_MAX_FAILURES ? now + LOCKOUT_MS : 0;
  ipStates.set(ip, { failures, lockUntil });
  return { failures, lockUntil };
}

export function clearIpFailures(ip: string) {
  ipStates.delete(ip);
}

export function userLockInfo(user: { failedAttempts?: number | null; lockedUntil?: Date | null } | null | undefined) {
  if (!user) return { locked: false, retryAfterMs: 0 };
  const until = user.lockedUntil ? new Date(user.lockedUntil).getTime() : 0;
  if (until > Date.now()) return { locked: true, retryAfterMs: until - Date.now() };
  return { locked: false, retryAfterMs: 0 };
}

export function smtpEnabled() {
  return !!(env.SMTP_HOST && env.SMTP_FROM);
}


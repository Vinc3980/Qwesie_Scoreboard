import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

function mkReq(over: any = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    cookies: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    protocol: 'http',
    get: (h: string) => (h.toLowerCase() === 'host' ? 'localhost:5000' : ''),
    ...over,
  } as any;
}
function mkRes() {
  const res: any = { statusCode: 200, body: null, cookiesSet: [] as any[], cookiesCleared: [] as any[] };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  res.cookie = (name: string, val: string, opts: any) => { res.cookiesSet.push({ name, val, opts }); return res; };
  res.clearCookie = (name: string, opts?: any) => { res.cookiesCleared.push({ name, opts }); return res; };
  return res;
}
function mkNext() { const fn: any = vi.fn(); return fn; }

const baseEnv = {
  PORT: 5000,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://x',
  CORS_ORIGIN: 'http://localhost:5173',
  JWT_SECRET: 'test-secret-key-at-least-32-chars-long',
  JWT_COOKIE_NAME: 'qwesie_token',
  UPLOADS_DIR: 'uploads',
  CLIENT_DIST_DIR: '',
  SERVE_CLIENT: false,
  BACKUP_DIR: 'backups',
  BACKUP_INTERVAL_MINUTES: 5,
  BACKUP_ON_START: false,
  PG_DUMP_PATH: 'pg_dump',
  DEV_AUTO_LOGIN: false,
  ALLOW_SCORER_PIN: false,
  SMTP_HOST: '',
  SMTP_PORT: 587,
  SMTP_USER: '',
  SMTP_PASS: '',
  SMTP_FROM: '',
  SMTP_SECURE: false,
  APP_BASE_URL: '',
};

async function loadAuth(overrides: { env?: any; prisma?: any } = {}) {
  vi.resetModules();

  const prisma = {
    role: { upsert: vi.fn(), findFirst: vi.fn() },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    userRecoveryCode: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
    ...(overrides.prisma || {}),
  };
  // deep-ish merge for convenience
  if (overrides.prisma?.user) prisma.user = { ...prisma.user, ...overrides.prisma.user };
  if (overrides.prisma?.userRecoveryCode) prisma.userRecoveryCode = { ...prisma.userRecoveryCode, ...overrides.prisma.userRecoveryCode };
  if (overrides.prisma?.passwordResetToken) prisma.passwordResetToken = { ...prisma.passwordResetToken, ...overrides.prisma.passwordResetToken };

  const env = { ...baseEnv, ...(overrides.env || {}) };

  vi.doMock('../src/config/database.js', () => ({ prisma }));
  vi.doMock('../src/config/env.js', () => ({ env }));
  vi.doMock('../src/utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
  vi.doMock('../src/utils/bootstrapStatus.js', () => ({ getBootstrapStatus: vi.fn(async () => ({ needsBootstrap: false, setupTokenRequired: false })) }));

  const security = await import('../src/utils/authSecurity.js');
  const { AuthController } = await import('../src/controllers/auth.controller.js');
  const authMw = await import('../src/middleware/auth.js');
  return { prisma, env, security, AuthController, authMw };
}

describe('auth security', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('lockout triggers after 5 failed attempts and returns generic error; clears after window on success', async () => {
    const { prisma, security, AuthController } = await loadAuth();
    const hash = await security.hashPassword('CorrectPass1!');
    const user = { id: 'u1', username: 'alice', email: 'a@qwesie.local', passwordHash: hash, isActive: true, role: { name: 'SCORER' }, failedAttempts: 0, lockedUntil: null, tokenVersion: 0, mustChangePassword: false, displayName: 'Alice' };

    // simulate DB state updates across attempts
    let dbFails = 0; let dbLock: Date | null = null;
    prisma.user.findFirst.mockImplementation(async () => ({ ...user, failedAttempts: dbFails, lockedUntil: dbLock }));
    prisma.user.update.mockImplementation(async ({ data }: any) => {
      if (data.failedAttempts?.increment) dbFails += 1;
      else if (typeof data.failedAttempts === 'number') dbFails = data.failedAttempts;
      if (data.lockedUntil instanceof Date) dbLock = data.lockedUntil;
      else if (data.lockedUntil === null) dbLock = null;
      if (data.tokenVersion?.increment) user.tokenVersion = (user.tokenVersion || 0) + 1;
      return { ...user, failedAttempts: dbFails, lockedUntil: dbLock };
    });

    const ip = '10.0.0.55';
    // 5 failed attempts
    for (let i = 1; i <= 5; i++) {
      const req = mkReq({ body: { username: 'alice', password: 'wrongpass' }, ip, socket: { remoteAddress: ip } });
      const res = mkRes();
      await AuthController.login(req, res, mkNext());
      if (i < 5) {
        expect(res.statusCode).toBe(401);
        expect(res.body.error.message).toBe('Invalid username or password'); // generic, no enumeration
      } else {
        expect([423, 401]).toContain(res.statusCode); // 5th may lock
      }
    }
    // locked now
    expect(dbFails).toBeGreaterThanOrEqual(5);
    expect(dbLock).not.toBeNull();

    const lockedReq = mkReq({ body: { username: 'alice', password: 'CorrectPass1!' }, ip, socket: { remoteAddress: ip } });
    const lockedRes = mkRes();
    await AuthController.login(lockedReq, lockedRes, mkNext());
    expect(lockedRes.statusCode).toBe(423);
    expect(lockedRes.body.error.message).toContain('Too many failed attempts');
    // does not reveal username existence
    expect(String(lockedRes.body.error.message).toLowerCase()).not.toContain('alice');

    // clear after window: expire lock and try correct password
    dbLock = new Date(Date.now() - 1000);
    dbFails = 5;
    // also clear IP tracker by using a new IP (in-memory IP lock is separate) or wait window - easier use fresh IP
    const freshIp = '10.0.0.56';
    const okReq = mkReq({ body: { username: 'alice', password: 'CorrectPass1!' }, ip: freshIp, socket: { remoteAddress: freshIp } });
    const okRes = mkRes();
    await AuthController.login(okReq, okRes, mkNext());
    expect(okRes.statusCode).toBe(200);
    expect(okRes.body.success).toBe(true);
    expect(okRes.cookiesSet.length).toBeGreaterThan(0);
  }, 20000);

  it('unknown username returns generic error (no enumeration)', async () => {
    const { prisma, AuthController } = await loadAuth();
    prisma.user.findFirst.mockResolvedValue(null);
    const req = mkReq({ body: { username: 'nobody', password: 'whatever123' } });
    const res = mkRes();
    await AuthController.login(req, res, mkNext());
    expect(res.statusCode).toBe(401);
    expect(res.body.error.message).toBe('Invalid username or password');
  });

  it('change password verifies current, enforces policy, bumps tokenVersion and reissues session', async () => {
    const { prisma, security, AuthController, env } = await loadAuth();
    const oldHash = await security.hashPassword('OldPass123!');
    const user = { id: 'u2', username: 'bob', email: 'b@qwesie.local', passwordHash: oldHash, isActive: true, role: { name: 'ADMIN' }, failedAttempts: 0, lockedUntil: null, tokenVersion: 2, mustChangePassword: false, displayName: 'Bob' };
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockImplementation(async ({ data }: any) => ({ ...user, tokenVersion: (user.tokenVersion || 0) + 1, passwordHash: data.passwordHash || user.passwordHash, mustChangePassword: false }));

    const req = mkReq({ body: { currentPassword: 'OldPass123!', newPassword: 'NewPass456!' }, user: { id: 'u2', role: 'ADMIN', username: 'bob' } });
    const res = mkRes();
    await AuthController.changePassword(req, res, mkNext());
    expect(res.statusCode).toBe(200);
    expect(prisma.user.update).toHaveBeenCalled();
    const upd = prisma.user.update.mock.calls[0][0];
    expect(upd.data.tokenVersion).toEqual({ increment: 1 });
    expect(upd.data.mustChangePassword).toBe(false);
    expect(res.cookiesSet.length).toBeGreaterThan(0);
    const token = res.cookiesSet[0].val;
    const decoded: any = jwt.verify(token, env.JWT_SECRET);
    expect(decoded.tokenVersion).toBe(3);
  });

  it('change password rejects wrong current password', async () => {
    const { prisma, security, AuthController } = await loadAuth();
    const oldHash = await security.hashPassword('OldPass123!');
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', username: 'bob', isActive: true, role: { name: 'ADMIN' }, passwordHash: oldHash, tokenVersion: 0 });
    const req = mkReq({ body: { currentPassword: 'nope', newPassword: 'NewPass456!' }, user: { id: 'u2', role: 'ADMIN' } });
    const res = mkRes();
    await AuthController.changePassword(req, res, mkNext());
    expect(res.statusCode).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('token invalidation: old tokenVersion is rejected by authenticate', async () => {
    const { prisma, env, authMw } = await loadAuth();
    prisma.user.findUnique.mockResolvedValue({ id: 'u3', username: 'carl', isActive: true, role: { name: 'SCORER' }, tokenVersion: 5, mustChangePassword: false });
    const token = jwt.sign({ id: 'u3', role: 'SCORER', username: 'carl', tokenVersion: 4 }, env.JWT_SECRET, { expiresIn: '1h' });
    const req = mkReq({ cookies: { [env.JWT_COOKIE_NAME]: token } });
    const res = mkRes();
    await authMw.authenticate(req, res, mkNext());
    expect(req.user).toBeUndefined();
  });

  it('token invalidation: matching tokenVersion authenticates', async () => {
    const { prisma, env, authMw } = await loadAuth();
    prisma.user.findUnique.mockResolvedValue({ id: 'u3', username: 'carl', isActive: true, role: { name: 'SCORER' }, tokenVersion: 5, mustChangePassword: false });
    const token = jwt.sign({ id: 'u3', role: 'SCORER', username: 'carl', tokenVersion: 5 }, env.JWT_SECRET, { expiresIn: '1h' });
    const req = mkReq({ cookies: { [env.JWT_COOKIE_NAME]: token } });
    const res = mkRes();
    await authMw.authenticate(req, res, mkNext());
    expect(req.user?.id).toBe('u3');
  });

  it('disable/reset flows bump tokenVersion (session invalidation)', async () => {
    const { prisma, security, AuthController } = await loadAuth();
    const tempTarget = { id: 'u4', username: 'dave', isActive: true, role: { name: 'SCORER' }, passwordHash: 'x', tokenVersion: 1 };
    prisma.user.findUnique.mockResolvedValue(tempTarget);
    prisma.user.update.mockImplementation(async ({ data }: any) => ({ ...tempTarget, tokenVersion: (tempTarget.tokenVersion || 0) + 1, mustChangePassword: !!data.mustChangePassword }));
    const req = mkReq({ params: { id: 'u4' }, user: { id: 'admin1', role: 'ADMIN' } });
    const res = mkRes();
    await AuthController.resetPassword(req, res, mkNext());
    expect(res.statusCode).toBe(200);
    expect(res.body.data.tempPassword).toBeTruthy();
    expect(prisma.user.update.mock.calls[0][0].data.tokenVersion).toEqual({ increment: 1 });
    expect(prisma.user.update.mock.calls[0][0].data.mustChangePassword).toBe(true);
  });

  it('recovery code reset consumes code, updates password and invalidates sessions (admin only)', async () => {
    const { prisma, security, AuthController } = await loadAuth();
    const user = { id: 'admin2', username: 'root', isActive: true, role: { name: 'ADMIN' }, passwordHash: 'old', tokenVersion: 0, failedAttempts: 0, lockedUntil: null };
    prisma.user.findFirst.mockResolvedValue(user);
    const code = 'ABCD-EFGH-IJKL';
    const codeHash = security.sha256(security.normalizeRecoveryCode(code));
    prisma.userRecoveryCode.findFirst.mockResolvedValue({ id: 'rc1', userId: 'admin2', codeHash, usedAt: null });
    prisma.userRecoveryCode.update.mockResolvedValue({ id: 'rc1', usedAt: new Date() });
    prisma.user.update.mockResolvedValue({ ...user, tokenVersion: 1 });
    prisma.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));

    const req = mkReq({ body: { username: 'root', recoveryCode: code, newPassword: 'NewStrongPass1!' }, ip: '10.1.1.1', socket: { remoteAddress: '10.1.1.1' } });
    const res = mkRes();
    await AuthController.resetWithRecoveryCode(req, res, mkNext());
    expect(res.statusCode).toBe(200);
    expect(prisma.userRecoveryCode.update).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
    const upd = prisma.user.update.mock.calls[0][0];
    expect(upd.data.tokenVersion).toEqual({ increment: 1 });
    expect(upd.data.mustChangePassword).toBe(false);
  });

  it('temp password reset requires mustChangePassword and correct temp password', async () => {
    const { prisma, security, AuthController } = await loadAuth();
    const temp = 'TempPass123';
    const hash = await security.hashPassword(temp);
    const user = { id: 'u5', username: 'erin', isActive: true, role: { name: 'SCORER' }, passwordHash: hash, tokenVersion: 1, mustChangePassword: true };
    prisma.user.findFirst.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({ ...user, tokenVersion: 2, mustChangePassword: false });

    const bad = mkRes();
    await AuthController.resetWithTempPassword(mkReq({ body: { username: 'erin', tempPassword: 'wrong', newPassword: 'BrandNew123!' }, ip: '10.2.2.2', socket: { remoteAddress: '10.2.2.2' } }), bad, mkNext());
    expect(bad.statusCode).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();

    const ok = mkRes();
    await AuthController.resetWithTempPassword(mkReq({ body: { username: 'erin', tempPassword: temp, newPassword: 'BrandNew123!' }, ip: '10.2.2.3', socket: { remoteAddress: '10.2.2.3' } }), ok, mkNext());
    expect(ok.statusCode).toBe(200);
    expect(prisma.user.update.mock.calls[0][0].data.tokenVersion).toEqual({ increment: 1 });
  });

  it('guards: cannot disable or demote or delete yourself', async () => {
    const { prisma, AuthController } = await loadAuth();
    const self = { id: 'admin1', username: 'admin', isActive: true, role: { name: 'ADMIN' } };
    prisma.user.findUnique.mockResolvedValue(self);

    const r1 = mkRes();
    await AuthController.updateUser(mkReq({ params: { id: 'admin1' }, body: { active: false }, user: { id: 'admin1', role: 'ADMIN' } }), r1, mkNext());
    expect(r1.statusCode).toBe(400);
    expect(r1.body.error.message).toMatch(/cannot disable your own/i);

    const r2 = mkRes();
    await AuthController.updateUser(mkReq({ params: { id: 'admin1' }, body: { role: 'SCORER' }, user: { id: 'admin1', role: 'ADMIN' } }), r2, mkNext());
    expect(r2.statusCode).toBe(400);
    expect(r2.body.error.message).toMatch(/cannot change your own role/i);

    const r3 = mkRes();
    await AuthController.deleteOrDisableUser(mkReq({ params: { id: 'admin1' }, user: { id: 'admin1', role: 'ADMIN' } }), r3, mkNext());
    expect(r3.statusCode).toBe(400);
  });

  it('guards: cannot demote/disable/delete the last active admin', async () => {
    const { prisma, AuthController } = await loadAuth();
    const target = { id: 'admin9', username: 'sole', isActive: true, role: { name: 'ADMIN' } };
    prisma.user.findUnique.mockResolvedValue(target);
    prisma.user.count.mockResolvedValue(0); // no other active admins

    const r1 = mkRes();
    await AuthController.updateUser(mkReq({ params: { id: 'admin9' }, body: { role: 'SCORER' }, user: { id: 'admin1', role: 'ADMIN' } }), r1, mkNext());
    expect(r1.statusCode).toBe(400);
    expect(r1.body.error.message).toMatch(/last active admin/i);

    const r2 = mkRes();
    await AuthController.updateUser(mkReq({ params: { id: 'admin9' }, body: { active: false }, user: { id: 'admin1', role: 'ADMIN' } }), r2, mkNext());
    expect(r2.statusCode).toBe(400);

    const r3 = mkRes();
    await AuthController.deleteOrDisableUser(mkReq({ params: { id: 'admin9' }, user: { id: 'admin1', role: 'ADMIN' } }), r3, mkNext());
    expect(r3.statusCode).toBe(400);
  });
});

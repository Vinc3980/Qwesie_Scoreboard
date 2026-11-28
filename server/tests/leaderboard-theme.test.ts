import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    leaderboardTheme: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
    competition: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock('../src/config/database.js', () => ({ prisma: prismaMock }));
vi.mock('../src/utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const svc = await import('../src/services/leaderboardTheme.service.js');
const { leaderboardThemeConfigSchema, defaultLeaderboardThemeConfig, sanitizeLeaderboardThemeConfig, leaderboardContrastWarnings, computeLeaderboardFit } = await import('@qwesie/shared');

describe('leaderboard theme schema and service', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('validates and sanitizes config with defaults', () => {
    const cfg = sanitizeLeaderboardThemeConfig({ layout: { rowsPerPage: 12, fitAll: true }, logos: { shape: 'circle', size: 60 } });
    expect(cfg.layout.rowsPerPage).toBe(12);
    expect(cfg.layout.fitAll).toBe(true);
    expect(cfg.logos.shape).toBe('circle');
    expect(cfg.colors.background).toBeTruthy();
    expect(() => leaderboardThemeConfigSchema.parse({ layout: { rowsPerPage: 999 } })).toThrow();
  });

  it('falls back to builtin when no theme found', async () => {
    prismaMock.competition.findUnique.mockResolvedValueOnce({ id: 'c1', leaderboardThemeId: null });
    const resolved = await svc.resolveLeaderboardTheme({ competitionId: 'c1' });
    expect(resolved.isBuiltIn).toBe(true);
    expect(resolved.id).toBe('builtin-lb-classic');
  });

  it('resolves explicit theme id', async () => {
    const resolved = await svc.resolveLeaderboardTheme({ themeId: 'builtin-lb-minimal' });
    expect(resolved.name).toBe('Minimal');
  });

  it('reports contrast warnings for low-contrast configs', () => {
    const cfg = defaultLeaderboardThemeConfig();
    const bad = { ...cfg, colors: { ...cfg.colors, text: '#222222', rowBg: '#333333', headerBg: '#333333', background:'#111111', accent:'#222222' } };
    const warnings = leaderboardContrastWarnings(bad as any);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('computes fit-all scale for 4, 10, 20 teams', () => {
    const r4 = computeLeaderboardFit(4, { rowHeight: 56 });
    const r10 = computeLeaderboardFit(10, { rowHeight: 56 });
    const r20 = computeLeaderboardFit(20, { rowHeight: 56 });
    expect(r4.fits).toBe(true);
    expect(r10.fits).toBe(true);
    expect(r20.scale).toBeGreaterThanOrEqual(0.35);
    // 20 teams should either fit or fallback; our function returns fits false if below minScale
    expect(r20.rowsPerPage).toBeGreaterThan(0);
  });
});

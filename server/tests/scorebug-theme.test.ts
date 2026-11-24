import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    match: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    competition: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    broadcastGraphicState: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    scorebugTheme: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
  },
}));

vi.mock('../src/config/database.js', () => ({ prisma: prismaMock }));
vi.mock('../src/sockets/socketManager.js', () => ({
  broadcastOutputSceneState: vi.fn(),
  broadcastActiveGraphicState: vi.fn(),
  broadcastOutputPreviewState: vi.fn(),
}));
vi.mock('../src/utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../src/services/broadcast.service.js', () => ({
  getOutputSceneState: vi.fn(async (matchId: string) => ({ matchId, scene: 'PLAY', scorebug: { visible: true } })),
}));

const svc = await import('../src/services/scorebugTheme.service.js');
const { scorebugThemeConfigSchema, defaultScorebugThemeConfig } = await import('@qwesie/shared');

describe('scorebug theme service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  });

  it('resolves match override > competition > global default > builtin classic', async () => {
    prismaMock.match.findUnique.mockResolvedValueOnce({
      id: 'm1', scorebugThemeId: 't-match', competitionId: 'c1', competition: { scorebugThemeId: 't-comp' },
    });
    prismaMock.scorebugTheme.findUnique.mockResolvedValueOnce({
      id: 't-match', name: 'Match Theme', description: null, config: defaultScorebugThemeConfig(), isDefault: false, competitionId: null, isBuiltIn: false, version: 2, createdAt: new Date(), updatedAt: new Date(),
    });
    const resolved = await svc.getResolvedScorebugThemeForMatch('m1');
    expect(resolved.id).toBe('t-match');
    expect(resolved.source).toBe('match');

    prismaMock.match.findUnique.mockResolvedValueOnce({
      id: 'm2', scorebugThemeId: null, competitionId: 'c1', competition: { scorebugThemeId: 't-comp' },
    });
    prismaMock.scorebugTheme.findUnique.mockResolvedValueOnce({
      id: 't-comp', name: 'Comp Theme', description: null, config: defaultScorebugThemeConfig(), isDefault: false, competitionId: 'c1', isBuiltIn: false, version: 1, createdAt: new Date(), updatedAt: new Date(),
    });
    const resolved2 = await svc.getResolvedScorebugThemeForMatch('m2');
    expect(resolved2.id).toBe('t-comp');
    expect(resolved2.source).toBe('competition');

    prismaMock.match.findUnique.mockResolvedValueOnce({
      id: 'm3', scorebugThemeId: null, competitionId: null, competition: null,
    });
    prismaMock.scorebugTheme.findFirst.mockResolvedValueOnce({
      id: 't-global', name: 'Global', description: null, config: defaultScorebugThemeConfig(), isDefault: true, competitionId: null, isBuiltIn: false, version: 3, createdAt: new Date(), updatedAt: new Date(),
    });
    const resolved3 = await svc.getResolvedScorebugThemeForMatch('m3');
    expect(resolved3.id).toBe('t-global');
    expect(resolved3.source).toBe('global');

    prismaMock.match.findUnique.mockResolvedValueOnce({
      id: 'm4', scorebugThemeId: null, competitionId: null, competition: null,
    });
    prismaMock.scorebugTheme.findFirst.mockResolvedValueOnce(null);
    const resolved4 = await svc.getResolvedScorebugThemeForMatch('m4');
    expect(resolved4.id).toBe('builtin-classic');
    expect(resolved4.source).toBe('builtin');
  });

  it('falls back when referenced theme is deleted/missing', async () => {
    prismaMock.match.findUnique.mockResolvedValueOnce({
      id: 'm1', scorebugThemeId: 'missing', competitionId: null, competition: null,
    });
    prismaMock.scorebugTheme.findUnique.mockResolvedValueOnce(null);
    prismaMock.scorebugTheme.findFirst.mockResolvedValueOnce(null);
    const resolved = await svc.getResolvedScorebugThemeForMatch('m1');
    expect(resolved.id).toBe('builtin-classic');
  });

  it('validates theme config schema', () => {
    expect(() => scorebugThemeConfigSchema.parse({ layout: { scale: 999 } })).toThrow();
    expect(() => scorebugThemeConfigSchema.parse({ shape: { preset: 'triangle' } })).toThrow();
    const cfg = scorebugThemeConfigSchema.parse({ layout: { variant: 'compact', scale: 1.1 } });
    expect(cfg.layout.variant).toBe('compact');
    expect(cfg.layout.scale).toBe(1.1);
  });

  it('delete detaches references so outputs fall back', async () => {
    prismaMock.scorebugTheme.findUnique.mockResolvedValueOnce({
      id: 't1', name: 'X', description: null, config: defaultScorebugThemeConfig(), isDefault: false, competitionId: null, isBuiltIn: false, version: 1, createdAt: new Date(), updatedAt: new Date(),
    });
    prismaMock.match.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.competition.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.scorebugTheme.delete.mockResolvedValue({ id: 't1' });
    prismaMock.match.findMany.mockResolvedValue([]);
    prismaMock.scorebugTheme.findFirst.mockResolvedValue(null);

    const res = await svc.deleteScorebugTheme('t1');
    expect(res.deleted).toBe(true);
    expect(prismaMock.match.updateMany).toHaveBeenCalledWith({ where: { scorebugThemeId: 't1' }, data: { scorebugThemeId: null } });
    expect(prismaMock.competition.updateMany).toHaveBeenCalledWith({ where: { scorebugThemeId: 't1' }, data: { scorebugThemeId: null } });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, socketMock } = vi.hoisted(() => ({
  prismaMock: {
    broadcastGraphicState: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    match: {
      findUnique: vi.fn(),
    },
    matchSet: {
      count: vi.fn(),
    },
    scorebugTheme: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  socketMock: {
    broadcastOutputSceneState: vi.fn(),
    broadcastActiveGraphicState: vi.fn(),
  },
}));

vi.mock('../src/config/database.js', () => ({ prisma: prismaMock }));
vi.mock('../src/sockets/socketManager.js', () => socketMock);
vi.mock('../src/utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const broadcast = await import('../src/services/broadcast.service.js');

function row(overrides: any = {}) {
  return {
    id: 'row1',
    matchId: 'm1',
    graphicType: 'SCENE',
    scene: 'PLAY',
    isVisible: false,
    scorebugVisible: true,
    scorebugVariant: 'classic',
    scorebugPosition: 'top-left',
    scorebugScale: 1,
    lockScene: false,
    timerEndsAt: null,
    version: 1,
    updatedAt: new Date('2026-11-19T12:00:00.000Z'),
    payload: { autoTriggers: {}, activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null, breakState: { active: false } },
    ...overrides,
  };
}

describe('broadcast timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T12:00:00.000Z'));
    vi.clearAllMocks();
    vi.resetAllMocks();
    prismaMock.match.findUnique.mockResolvedValue({ revision: 5, court: '1' });
    prismaMock.scorebugTheme.findFirst.mockResolvedValue(null);
    prismaMock.scorebugTheme.findUnique.mockResolvedValue(null);
  });

  it('schedules auto-return for all timed non-PLAY scenes', async () => {
    const timedScenes = ['SET_BREAK', 'TIMEOUT', 'MATCH_STATS', 'LINEUPS', 'HEAD_TO_HEAD', 'PLAYER_SPOTLIGHT', 'MATCH_MOMENTUM', 'FINAL', 'BREAK_SLATE'] as const;

    for (const [i, scene] of timedScenes.entries()) {
      vi.clearAllMocks();
      vi.resetAllMocks();
      prismaMock.match.findUnique.mockResolvedValue({ revision: 5, court: '1' });
    prismaMock.scorebugTheme.findFirst.mockResolvedValue(null);
    prismaMock.scorebugTheme.findUnique.mockResolvedValue(null);
      const nowMs = Date.now();
      const endsAt = new Date(nowMs + 10_000);
      const prev = row({ id: `r${i}`, matchId: `m${i}`, scene: 'PLAY' });
      const active = row({ id: `r${i}`, matchId: `m${i}`, scene, isVisible: true, timerEndsAt: endsAt, version: 2, payload: { autoTriggers: {}, activeTemplate: scene, graphicPayload: {}, graphicStartedAt: new Date(nowMs).toISOString() } });
      const returned = row({ id: `r${i}`, matchId: `m${i}`, scene: 'PLAY', isVisible: false, timerEndsAt: null, version: 3, payload: { autoTriggers: {}, activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null } });

      prismaMock.broadcastGraphicState.findFirst.mockResolvedValueOnce(prev); // ensureRow in setOutputScene
      prismaMock.broadcastGraphicState.update.mockResolvedValueOnce(active); // setOutputScene update
      prismaMock.broadcastGraphicState.findFirst.mockResolvedValueOnce(active); // ensureRow in timer fire
      prismaMock.broadcastGraphicState.update.mockResolvedValueOnce(returned); // auto-return update

      await broadcast.setOutputScene(`m${i}`, { scene: scene as any, timerEndsAt: endsAt.toISOString() });
      expect(prismaMock.broadcastGraphicState.update).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10_100);

      expect(prismaMock.broadcastGraphicState.update).toHaveBeenCalledTimes(2);
      const backData = prismaMock.broadcastGraphicState.update.mock.calls[1][0].data;
      expect(backData.scene).toBe('PLAY');
      expect(backData.timerEndsAt).toBeNull();
      expect(socketMock.broadcastOutputSceneState).toHaveBeenCalled();
      const emitted = socketMock.broadcastOutputSceneState.mock.calls.at(-1)?.[1];
      expect(emitted.scene).toBe('PLAY');
      expect(emitted.template).toBeNull();
    }
  });

  it('recoverBroadcastTimers recovers all timed non-PLAY scenes (expired and future)', async () => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.setSystemTime(new Date('2026-11-19T12:00:30.000Z'));
    prismaMock.match.findUnique.mockResolvedValue({ revision: 5, court: '1' });
    prismaMock.scorebugTheme.findFirst.mockResolvedValue(null);
    prismaMock.scorebugTheme.findUnique.mockResolvedValue(null);

    const expired = row({ id: 'e1', matchId: 'me', scene: 'PLAYER_SPOTLIGHT', isVisible: true, timerEndsAt: new Date('2026-11-19T12:00:10.000Z'), version: 2, payload: { autoTriggers: {}, activeTemplate: 'PLAYER_SPOTLIGHT', graphicPayload: { playerId: 'p1' }, graphicStartedAt: '2026-11-19T12:00:00.000Z' } });
    const future = row({ id: 'f1', matchId: 'mf', scene: 'SET_BREAK', isVisible: true, timerEndsAt: new Date('2026-11-19T12:00:40.000Z'), version: 2, payload: { autoTriggers: {}, activeTemplate: 'SET_RESULT', graphicPayload: {}, graphicStartedAt: '2026-11-19T12:00:20.000Z' } });
    const expiredReturned = row({ id: 'e1', matchId: 'me', scene: 'PLAY', isVisible: false, timerEndsAt: null, version: 3, payload: { autoTriggers: {}, activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null } });
    const futureReturned = row({ id: 'f1', matchId: 'mf', scene: 'PLAY', isVisible: false, timerEndsAt: null, version: 3, payload: { autoTriggers: {}, activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null } });

    prismaMock.broadcastGraphicState.findMany.mockResolvedValueOnce([expired, future]);
    // expired -> immediate return update
    prismaMock.broadcastGraphicState.update.mockResolvedValueOnce(expiredReturned);
    // future timer fires later -> ensureRow returns future, then update to play
    prismaMock.broadcastGraphicState.findFirst.mockResolvedValue(future);
    prismaMock.broadcastGraphicState.update.mockResolvedValueOnce(futureReturned);

    const recovered = await broadcast.recoverBroadcastTimers();
    expect(recovered).toBe(2);

    // expired one already returned
    expect(prismaMock.broadcastGraphicState.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.broadcastGraphicState.update.mock.calls[0][0].data.scene).toBe('PLAY');

    await vi.advanceTimersByTimeAsync(10_200);

    expect(prismaMock.broadcastGraphicState.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.broadcastGraphicState.update.mock.calls[1][0].data.scene).toBe('PLAY');
    const emittedForFuture = socketMock.broadcastOutputSceneState.mock.calls.find((c: any[]) => c[0] === 'mf')?.[1];
    expect(emittedForFuture?.scene).toBe('PLAY');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
});

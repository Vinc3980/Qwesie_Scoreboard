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
    broadcastOutputPreviewState: vi.fn(),
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
    payload: { autoTriggers: {}, activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null, breakState: { active: false }, previewCue: null },
    ...overrides,
  };
}

describe('preview/program isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T12:00:00.000Z'));
    vi.clearAllMocks();
    vi.resetAllMocks();
    prismaMock.match.findUnique.mockResolvedValue({ revision: 5, court: '1' });
    prismaMock.scorebugTheme.findFirst.mockResolvedValue(null);
    prismaMock.scorebugTheme.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('preview state never reaches the output stream', async () => {
    const prev = row();
    const saved = row({ payload: { autoTriggers: {}, activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null, breakState: { active: false }, previewCue: { template: 'TEAM_COMPARISON', payload: { focus: 'blocks' }, duration: 10, autoReturn: true, version: 1, updatedAt: '2026-11-19T12:00:00.000Z' } } });
    prismaMock.broadcastGraphicState.findFirst.mockResolvedValueOnce(prev);
    prismaMock.broadcastGraphicState.update.mockResolvedValueOnce(saved);

    const preview = await broadcast.setPreviewCue('m1', { template: 'TEAM_COMPARISON', payload: { focus: 'blocks' }, duration: 10, autoReturn: true });

    // Preview emitted only via preview channel
    expect(socketMock.broadcastOutputPreviewState).toHaveBeenCalledTimes(1);
    expect(preview.cue?.template).toBe('TEAM_COMPARISON');
    expect(preview.cue?.payload).toEqual({ focus: 'blocks' });

    // Program/output stream must not be touched by preview changes
    expect(socketMock.broadcastOutputSceneState).not.toHaveBeenCalled();
    expect(socketMock.broadcastActiveGraphicState).not.toHaveBeenCalled();

    // Program scene state never contains preview cue
    const program = broadcast.toState(saved, 5) as any;
    expect(program.template).toBeNull();
    expect(program.scene).toBe('PLAY');
    expect(program.previewCue).toBeUndefined();
    expect(program.payload).toEqual({});
  });
});

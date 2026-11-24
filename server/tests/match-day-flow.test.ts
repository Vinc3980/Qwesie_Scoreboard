import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/broadcast.service.js', () => ({ onMatchEventCommitted: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from '../src/config/database.js';
import { MatchService } from '../src/services/match.service.js';

function makeMatch(overrides: any = {}) {
  return {
    id: 'm1',
    status: 'LIVE',
    currentSetNumber: 1,
    bestOfSets: 5,
    setsToWin: 3,
    regularSetPoints: 25,
    finalSetPoints: 15,
    minPointDifference: 2,
    timeoutsPerSet: 2,
    substitutionsPerSet: 6,
    confirmSetEnd: true,
    homeTeamName: 'Home',
    awayTeamName: 'Away',
    setsWonHome: 0,
    setsWonAway: 0,
    servingSide: 'HOME',
    startedAt: new Date(),
    endedAt: null,
    court: '1',
    sets: [
      { id: 's1', matchId: 'm1', setNumber: 1, homePoints: 24, awayPoints: 20, targetPoints: 25, minDifference: 2, status: 'LIVE', pendingEnd: false, winnerSide: null, servingSide: 'HOME' },
      { id: 's2', matchId: 'm1', setNumber: 2, homePoints: 0, awayPoints: 0, targetPoints: 25, minDifference: 2, status: 'READY', pendingEnd: false, winnerSide: null, servingSide: 'HOME' },
      { id: 's3', matchId: 'm1', setNumber: 3, homePoints: 0, awayPoints: 0, targetPoints: 25, minDifference: 2, status: 'READY', pendingEnd: false, winnerSide: null, servingSide: 'HOME' },
      { id: 's4', matchId: 'm1', setNumber: 4, homePoints: 0, awayPoints: 0, targetPoints: 25, minDifference: 2, status: 'READY', pendingEnd: false, winnerSide: null, servingSide: 'HOME' },
      { id: 's5', matchId: 'm1', setNumber: 5, homePoints: 0, awayPoints: 0, targetPoints: 15, minDifference: 2, status: 'READY', pendingEnd: false, winnerSide: null, servingSide: 'HOME' },
    ],
    ...overrides,
  };
}

describe('Match day flow - service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('marks set pendingEnd at winning condition when confirmSetEnd is true', async () => {
    const match = makeMatch();
    const tx: any = {
      match: { findUnique: vi.fn().mockResolvedValue(match), update: vi.fn().mockResolvedValue(match), updateMany: vi.fn().mockResolvedValue({}) },
      matchSet: { update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...match.sets[0], ...data, homePoints: 25 })), updateMany: vi.fn().mockResolvedValue({}) },
      teamMatchStatistics: { update: vi.fn().mockResolvedValue({}) },
      playerMatchStatistics: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
      matchEvent: { create: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue(null) },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    vi.spyOn(MatchService as any, 'ensureIdempotent').mockResolvedValue(false);
    vi.spyOn(MatchService as any, 'bumpRevision').mockResolvedValue(undefined);
    vi.spyOn(MatchService as any, 'createEvent').mockResolvedValue(undefined);
    vi.spyOn(MatchService as any, 'ensurePlayerStats').mockResolvedValue(undefined);

    const result: any = await (MatchService as any).applyPoint(tx, match, 'A', 'POINT', undefined, {});
    expect(result.pendingEnd).toBe(true);
    expect(tx.matchSet.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ pendingEnd: true }) }));
  });

  it('undo clears pendingEnd on POINT_AWARDED', async () => {
    const match = makeMatch({
      sets: [{ id: 's1', matchId: 'm1', setNumber: 1, homePoints: 25, awayPoints: 20, targetPoints: 25, minDifference: 2, status: 'LIVE', pendingEnd: true, winnerSide: null, servingSide: 'HOME' }],
    });
    const tx: any = {
      match: { findUnique: vi.fn().mockResolvedValue(match) },
      matchSet: { update: vi.fn().mockResolvedValue({}) },
      teamMatchStatistics: { update: vi.fn().mockResolvedValue({}) },
      playerMatchStatistics: { updateMany: vi.fn().mockResolvedValue({}) },
    };
    const ev = { id: 'e1', type: 'POINT_AWARDED', teamSide: 'HOME', payload: { setNumber: 1 } };
    await (MatchService as any).reverseEvent(tx, 'm1', ev, {});
    expect(tx.matchSet.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ pendingEnd: false, homePoints: { decrement: 1 } }) }));
  });

  it('endSet completes pending/won set and moves to next set', async () => {
    const match = makeMatch({
      sets: [
        { id: 's1', matchId: 'm1', setNumber: 1, homePoints: 25, awayPoints: 20, targetPoints: 25, minDifference: 2, status: 'LIVE', pendingEnd: true, winnerSide: null, servingSide: 'HOME' },
        { id: 's2', matchId: 'm1', setNumber: 2, homePoints: 0, awayPoints: 0, targetPoints: 25, minDifference: 2, status: 'READY', pendingEnd: false, winnerSide: null, servingSide: 'HOME' },
      ],
    });
    const tx: any = {
      match: { findUnique: vi.fn().mockResolvedValue(match), update: vi.fn().mockResolvedValue({}) },
      matchSet: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
      matchEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    vi.spyOn(MatchService as any, 'bumpRevision').mockResolvedValue(undefined);
    vi.spyOn(MatchService as any, 'createEvent').mockResolvedValue(undefined);
    vi.spyOn(MatchService as any, 'ensureDefaultLineupForSet').mockResolvedValue(undefined);
    vi.spyOn(MatchService as any, 'emitAndGet').mockResolvedValue({ id: 'm1' } as any);

    await MatchService.endSet('m1');
    expect(tx.matchSet.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' }, data: expect.objectContaining({ status: 'COMPLETED', pendingEnd: false, winnerSide: 'HOME' }) }));
    expect(tx.match.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'BETWEEN_SETS', currentSetNumber: 2 }) }));
  });

  it('startSet starts the requested set and marks it LIVE', async () => {
    const pre = makeMatch({ status: 'BETWEEN_SETS', currentSetNumber: 2, sets: [
      { id: 's1', matchId: 'm1', setNumber: 1, homePoints: 25, awayPoints: 20, targetPoints: 25, minDifference: 2, status: 'COMPLETED', pendingEnd: false, winnerSide: 'HOME', servingSide: 'HOME' },
      { id: 's2', matchId: 'm1', setNumber: 2, homePoints: 0, awayPoints: 0, targetPoints: 25, minDifference: 2, status: 'READY', pendingEnd: false, winnerSide: null, servingSide: 'HOME' },
    ] });
    vi.spyOn(prisma.match, 'findUnique').mockResolvedValue(pre as any);
    const tx: any = {
      match: { findUnique: vi.fn().mockResolvedValue(pre), update: vi.fn().mockResolvedValue({}) },
      matchSet: { update: vi.fn().mockResolvedValue({}) },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    vi.spyOn(MatchService as any, 'createEvent').mockResolvedValue(undefined);
    vi.spyOn(MatchService as any, 'bumpRevision').mockResolvedValue(undefined);
    vi.spyOn(MatchService as any, 'emitAndGet').mockResolvedValue({ id: 'm1' } as any);

    await MatchService.startSet('m1', { setNumber: 2, servingSide: 'A' });
    expect(tx.match.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'LIVE', currentSetNumber: 2, servingSide: 'HOME' }) }));
    expect(tx.matchSet.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'LIVE', servingSide: 'HOME', pendingEnd: false }) }));
  });
});

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
      { id: 's1', matchId: 'm1', setNumber: 1, homePoints: 0, awayPoints: 0, targetPoints: 25, minDifference: 2, status: 'LIVE', pendingEnd: false, winnerSide: null, servingSide: 'HOME' },
    ],
    ...overrides,
  };
}

describe('Scoring controls: +1/-1', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('-1 blocks at 0-0', async () => {
    const match = makeMatch();
    const tx: any = {};
    await expect((MatchService as any).applyCorrectionPoint(tx, match, 'A', {})).rejects.toThrow(/No points to remove/);
  });

  it('-1 blocks when set is complete or pending end', async () => {
    const match = makeMatch({ sets: [{ id: 's1', matchId: 'm1', setNumber: 1, homePoints: 25, awayPoints: 20, targetPoints: 25, minDifference: 2, status: 'LIVE', pendingEnd: true, winnerSide: null, servingSide: 'HOME' }] });
    const tx: any = {};
    await expect((MatchService as any).applyCorrectionPoint(tx, match, 'A', {})).rejects.toThrow(/Undo end of set/i);
  });

  it('-1 records manual correction without rotation', async () => {
    const match = makeMatch({ sets: [{ id: 's1', matchId: 'm1', setNumber: 1, homePoints: 10, awayPoints: 8, targetPoints: 25, minDifference: 2, status: 'LIVE', pendingEnd: false, winnerSide: null, servingSide: 'HOME' }] });
    const tx: any = {
      matchSet: { update: vi.fn().mockResolvedValue({ ...match.sets[0], homePoints: 9, pendingEnd: false }) },
      teamMatchStatistics: { update: vi.fn().mockResolvedValue({}) },
    };
    vi.spyOn(MatchService as any, 'createEvent').mockResolvedValue({ id: 'ev-corr', type: 'CORRECTION', payload: { delta: -1 } });
    const res = await (MatchService as any).applyCorrectionPoint(tx, match, 'A', { actorUserId: 'u1' });
    expect(tx.matchSet.update).toHaveBeenCalledWith(expect.objectContaining({ data: { homePoints: { decrement: 1 } } }));
    expect(tx.teamMatchStatistics.update).toHaveBeenCalledWith(expect.objectContaining({ data: { points: { decrement: 1 } } }));
    expect((MatchService as any).createEvent).toHaveBeenCalledWith(tx, 'm1', expect.objectContaining({ type: 'CORRECTION', payload: expect.objectContaining({ delta: -1, kind: 'MANUAL_SCORE_CORRECTION' }) }));
    expect(res.event.id).toBe('ev-corr');
  });

  it('+1 awards point and updates serve/score in applyPoint', async () => {
    const match = makeMatch({ sets: [{ id: 's1', matchId: 'm1', setNumber: 1, homePoints: 10, awayPoints: 8, targetPoints: 25, minDifference: 2, status: 'LIVE', pendingEnd: false, winnerSide: null, servingSide: 'HOME' }] });
    const tx: any = {
      matchSet: { update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...match.sets[0], ...data, homePoints: (data.homePoints?.increment ? 11 : data.homePoints) })) },
      teamMatchStatistics: { update: vi.fn().mockResolvedValue({}) },
      match: { update: vi.fn().mockResolvedValue({}) },
    };
    vi.spyOn(MatchService as any, 'createEvent').mockResolvedValue({ id: 'ev1' });
    vi.spyOn(MatchService as any, 'ensurePlayerStats').mockResolvedValue(undefined);
    const res = await (MatchService as any).applyPoint(tx, match, 'A', 'MANUAL', undefined, {});
    expect(res.setCompleted).toBe(false);
    expect(tx.teamMatchStatistics.update).toHaveBeenCalled();
  });
});

describe('Attribution', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it('attributeEvent rejects reversal and missing event', async () => {
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn({
      matchEvent: { findFirst: vi.fn().mockResolvedValueOnce(null) },
    }));
    await expect(MatchService.attributeEvent('m1', 'e404', { playerId: 'p1' })).rejects.toThrow(/Event not found/);
  });

  it('-1 true undo when last scoring event belongs to same team', async () => {
    const match = makeMatch({ sets: [{ id: 's1', matchId: 'm1', setNumber: 1, homePoints: 10, awayPoints: 8, targetPoints: 25, minDifference: 2, status: 'LIVE', pendingEnd: false, winnerSide: null, servingSide: 'HOME' }] });
    const lastEvent = { id: 'e-last', type: 'POINT_AWARDED', teamSide: 'HOME', payload: {} };
    const tx: any = {
      match: { findUnique: vi.fn().mockResolvedValue(match), update: vi.fn().mockResolvedValue({}) },
      matchSet: { update: vi.fn().mockResolvedValue({}) },
      teamMatchStatistics: { update: vi.fn().mockResolvedValue({}) },
      playerMatchStatistics: { updateMany: vi.fn().mockResolvedValue({}) },
      matchEvent: { findFirst: vi.fn().mockResolvedValue(lastEvent), create: vi.fn().mockResolvedValue({ id: 'e-undo', type: 'UNDO' }) },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    vi.spyOn(MatchService as any, 'ensureIdempotent').mockResolvedValue(false);
    vi.spyOn(MatchService as any, 'requireMatch').mockResolvedValue(match);
    vi.spyOn(MatchService as any, 'reverseEvent').mockResolvedValue(undefined);
    vi.spyOn(MatchService as any, 'createEvent').mockResolvedValue({ id: 'e-undo', type: 'UNDO' });
    vi.spyOn(MatchService as any, 'bumpRevision').mockResolvedValue(2);
    vi.spyOn(MatchService as any, 'emitAndGet').mockResolvedValue({ id: 'm1' } as any);
    await MatchService.changeScore('m1', 'A', -1, { actorUserId: 'u1' });
    expect((MatchService as any).reverseEvent).toHaveBeenCalled();
  });

  it('late attribution is allowed on point events (attribution window can expire, event stays attributable)', async () => {
    const ev = { id: 'e1', matchId: 'm1', type: 'POINT_AWARDED', teamSide: 'HOME', isReversal: false, sequenceNumber: 5, payload: { playerId: null } };
    const tx: any = {
      matchEvent: {
        findFirst: vi.fn().mockResolvedValue(ev),
        update: vi.fn().mockResolvedValue({}),
      },
      teamMatchStatistics: { update: vi.fn().mockResolvedValue({}) },
      playerMatchStatistics: { updateMany: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    vi.spyOn(MatchService as any, 'ensurePlayerStats').mockResolvedValue(undefined);
    vi.spyOn(MatchService as any, 'createEvent').mockResolvedValue({ id: 'note1' });
    vi.spyOn(MatchService as any, 'bumpRevision').mockResolvedValue(3);
    vi.spyOn(MatchService as any, 'emitAndGet').mockResolvedValue({ id: 'm1' } as any);
    await MatchService.attributeEvent('m1', 'e1', { playerId: 'p1' }, 'u1');
    expect(tx.matchEvent.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e1' }, data: expect.objectContaining({ payload: expect.objectContaining({ playerId: 'p1' }) }) }));
  });
});

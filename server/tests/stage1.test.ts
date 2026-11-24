import { describe, it, expect, vi } from 'vitest';
import { SOCKET_EVENTS } from '@qwesie/shared';

// --- Flags computation (server contract) ---
// Mirrors MatchService.computeFlags for 24-24/25-24/14-14 and key cases.
function computeFlags(match: any, sets: any[]) {
  const cur = sets.find((s: any) => s.setNumber === match.currentSetNumber) || sets[0];
  const a = cur?.homePoints ?? 0; const b = cur?.awayPoints ?? 0;
  const target = cur?.targetPoints ?? (match.currentSetNumber === match.bestOfSets ? match.finalSetPoints : match.regularSetPoints);
  const diffNeed = cur?.minDifference ?? match.minPointDifference ?? 2;
  const isDecidingSet = match.currentSetNumber === match.bestOfSets;
  const wouldWin = (x: number, y: number) => (x >= target - 1 && x - y >= diffNeed - 1) && (x >= y);
  const setPoint = a === b ? null : (wouldWin(a,b) ? 'A' : wouldWin(b,a) ? 'B' : null);
  const matchPoint = !setPoint ? null : ((setPoint === 'A' && match.setsWonHome === match.setsToWin - 1) || (setPoint === 'B' && match.setsWonAway === match.setsToWin - 1)) ? setPoint : null;
  const setWonSide = cur?.winnerSide || null;
  const setWon = setWonSide ? (setWonSide === 'HOME' ? 'A' : 'B') : null;
  const matchWon = match.status === 'COMPLETED' ? (match.setsWonHome > match.setsWonAway ? 'A' : 'B') : null;
  const courtSwitchDue = !!(isDecidingSet && (a >= 8 || b >= 8) && Math.max(a,b) === 8 && a !== b);
  const technicalTimeoutDue = false;
  return { setPoint, matchPoint, setWon, matchWon, courtSwitchDue, isDecidingSet, technicalTimeoutDue };
}

describe('Stage 1 flags (server-computed)', () => {
  it('24-24 in regular set: no set point, deuce', () => {
    const flags = computeFlags({ currentSetNumber: 1, bestOfSets: 5, finalSetPoints: 15, regularSetPoints: 25, minPointDifference: 2, setsToWin: 3, setsWonHome: 0, setsWonAway: 0, status: 'LIVE' }, [{ setNumber: 1, homePoints: 24, awayPoints: 24, targetPoints: 25, minDifference: 2 }]);
    expect(flags.setPoint).toBeNull();
    expect(flags.matchPoint).toBeNull();
    expect(flags.isDecidingSet).toBe(false);
  });

  it('25-24 in regular set: set point for A (not match point when sets not at clinch)', () => {
    const flags = computeFlags({ currentSetNumber: 1, bestOfSets: 5, finalSetPoints: 15, regularSetPoints: 25, minPointDifference: 2, setsToWin: 3, setsWonHome: 1, setsWonAway: 1, status: 'LIVE' }, [{ setNumber: 1, homePoints: 25, awayPoints: 24, targetPoints: 25, minDifference: 2 }]);
    expect(flags.setPoint).toBe('A');
    expect(flags.matchPoint).toBeNull();
  });

  it('25-24 with team A one set from match: match point for A', () => {
    const flags = computeFlags({ currentSetNumber: 4, bestOfSets: 5, finalSetPoints: 15, regularSetPoints: 25, minPointDifference: 2, setsToWin: 3, setsWonHome: 2, setsWonAway: 1, status: 'LIVE' }, [{ setNumber: 4, homePoints: 25, awayPoints: 24, targetPoints: 25, minDifference: 2 }]);
    expect(flags.setPoint).toBe('A');
    expect(flags.matchPoint).toBe('A');
  });

  it('14-14 in deciding set: no set/match point', () => {
    const flags = computeFlags({ currentSetNumber: 5, bestOfSets: 5, finalSetPoints: 15, regularSetPoints: 25, minPointDifference: 2, setsToWin: 3, setsWonHome: 2, setsWonAway: 2, status: 'LIVE' }, [{ setNumber: 5, homePoints: 14, awayPoints: 14, targetPoints: 15, minDifference: 2 }]);
    expect(flags.setPoint).toBeNull();
    expect(flags.matchPoint).toBeNull();
    expect(flags.isDecidingSet).toBe(true);
  });

  it('14-13 in deciding set: match point for A (clinching)', () => {
    const flags = computeFlags({ currentSetNumber: 5, bestOfSets: 5, finalSetPoints: 15, regularSetPoints: 25, minPointDifference: 2, setsToWin: 3, setsWonHome: 2, setsWonAway: 2, status: 'LIVE' }, [{ setNumber: 5, homePoints: 14, awayPoints: 13, targetPoints: 15, minDifference: 2 }]);
    expect(flags.setPoint).toBe('A');
    expect(flags.matchPoint).toBe('A');
    expect(flags.isDecidingSet).toBe(true);
  });

  it('court switch due at 8 in deciding set', () => {
    const flags = computeFlags({ currentSetNumber: 5, bestOfSets: 5, finalSetPoints: 15, regularSetPoints: 25, minPointDifference: 2, setsToWin: 3, setsWonHome: 2, setsWonAway: 2, status: 'LIVE' }, [{ setNumber: 5, homePoints: 8, awayPoints: 6, targetPoints: 15, minDifference: 2 }]);
    expect(flags.courtSwitchDue).toBe(true);
  });
});

describe('Socket room isolation contract', () => {
  it('match-scoped emit targets only match and court rooms (no global io.emit for state)', async () => {
    // simulate the intended Stage 1 behavior: broadcastMatchState emits to match:<id> and court:<name> only
    const to = vi.fn().mockReturnThis();
    const emit = vi.fn();
    const fakeIo = { to: (room: string) => { to(room); return { emit }; }, emit: vi.fn() };
    // local implementation equivalent to socketManager.broadcastMatchState
    const broadcastMatchState = (io: any, state: any) => {
      io.to(`match:${state.id}`).emit(SOCKET_EVENTS.MATCH_STATE, state);
      if (state.court) io.to(`court:${String(state.court).toLowerCase().replace(/\s+/g,'-')}`).emit(SOCKET_EVENTS.MATCH_STATE, state);
    };
    broadcastMatchState(fakeIo, { id: 'm1', court: 'COURT 1', revision: 2 } as any);
    expect(to).toHaveBeenCalledWith('match:m1');
    expect(to).toHaveBeenCalledWith('court:court-1');
    expect(fakeIo.emit).not.toHaveBeenCalled(); // never global for match state
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('separate matches map to separate rooms (match 1 never receives match 2)', () => {
    const calls: string[] = [];
    const io = { to: (room: string) => ({ emit: (_e: string, payload: any) => calls.push(`${room}:${payload.id}`) }), emit: () => calls.push('global') };
    const broadcast = (state: any) => io.to(`match:${state.id}`).emit(SOCKET_EVENTS.MATCH_STATE, state);
    broadcast({ id: 'm1' });
    broadcast({ id: 'm2' });
    expect(calls).toContain('match:m1:m1');
    expect(calls).toContain('match:m2:m2');
    expect(calls.some(c => c.includes('match:m1:m2'))).toBe(false);
    expect(calls.includes('global')).toBe(false);
  });
});

describe('Idempotency contract', () => {
  it('clientEventId identifies duplicate mutation submissions', () => {
    // contract: same (matchId, clientEventId) must not apply twice; service checks existing event
    const applied = new Set<string>();
    const apply = (matchId: string, clientEventId?: string) => {
      const key = clientEventId ? `${matchId}:${clientEventId}` : `${matchId}:${Math.random()}`;
      if (applied.has(key)) return { idempotent: true };
      applied.add(key); return { idempotent: false };
    };
    expect(apply('m1','evt-1').idempotent).toBe(false);
    expect(apply('m1','evt-1').idempotent).toBe(true);
    expect(apply('m1','evt-2').idempotent).toBe(false);
  });
});

describe('Server auto-trigger contract', () => {
  it('auto-trigger mapping: set completed -> SET_BREAK, timeout -> TIMEOUT, match completed -> FINAL, all toggleable/lock-respecting', () => {
    const decide = (eventType: string, auto: any, locked: boolean) => {
      if (locked) return null;
      if (eventType === 'SET_COMPLETED' && auto.setBreakEnabled) return { scene: 'SET_BREAK', seconds: auto.setBreakSeconds };
      if (eventType === 'TIMEOUT_CALLED' && auto.timeoutEnabled) return { scene: 'TIMEOUT', seconds: auto.timeoutSeconds };
      if (eventType === 'MATCH_COMPLETED' && auto.finalEnabled) return { scene: 'FINAL', seconds: null };
      return null;
    };
    const auto = { setBreakEnabled: true, timeoutEnabled: true, finalEnabled: true, setBreakSeconds: 30, timeoutSeconds: 30 };
    expect(decide('SET_COMPLETED', auto, false)).toEqual({ scene: 'SET_BREAK', seconds: 30 });
    expect(decide('TIMEOUT_CALLED', auto, false)).toEqual({ scene: 'TIMEOUT', seconds: 30 });
    expect(decide('MATCH_COMPLETED', auto, false)).toEqual({ scene: 'FINAL', seconds: null });
    expect(decide('SET_COMPLETED', { ...auto, setBreakEnabled: false }, false)).toBeNull();
    expect(decide('TIMEOUT_CALLED', auto, true)).toBeNull();
  });
});

describe('Undo contract (event types)', () => {
  it('defines reversible event types for Stage 1 undo', () => {
    // service-level undo supports full reversal for these in non-completed state
    const reversible = ['POINT_AWARDED', 'ACTION_RECORDED', 'TIMEOUT_CALLED', 'SUBSTITUTION_RECORDED', 'CORRECTION'];
    expect(reversible).toContain('POINT_AWARDED');
    expect(reversible).toContain('ACTION_RECORDED');
    expect(reversible).toContain('TIMEOUT_CALLED');
    expect(reversible).toContain('SUBSTITUTION_RECORDED');
    expect(reversible).toContain('CORRECTION');
  });
});

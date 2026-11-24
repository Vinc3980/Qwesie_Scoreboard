import { describe, it, expect } from 'vitest';
import { computeScopeStats, computeMatchAnalytics, buildComparison, type RecordedEvent, type MatchSetInfo } from '../src/engine/statisticsEngine.js';

const sets: MatchSetInfo[] = [
  { id: 's1', setNumber: 1, homePoints: 0, awayPoints: 0 },
];

function ev(seq: number, type: string, teamSide: 'HOME'|'AWAY'|null, payload: any = {}, extra: Partial<RecordedEvent> = {}): RecordedEvent {
  return { id: `e${seq}`, sequenceNumber: seq, type, teamSide, setId: 's1', payload, ...extra };
}

describe('Statistics formulas', () => {
  it('attack efficiency = (Kills - Attack Errors - Blocked Attacks) / Total Attack Attempts', () => {
    const events: RecordedEvent[] = [
      ev(1, 'ACTION_RECORDED', 'HOME', { action: 'KILL' }),
      ev(2, 'POINT_AWARDED', 'HOME', {}),
      ev(3, 'ACTION_RECORDED', 'HOME', { action: 'KILL' }),
      ev(4, 'POINT_AWARDED', 'HOME', {}),
      ev(5, 'ACTION_RECORDED', 'HOME', { action: 'ATTACK_ERROR' }),
      ev(6, 'POINT_AWARDED', 'AWAY', {}),
      ev(7, 'ACTION_RECORDED', 'HOME', { action: 'BLOCKED_ATTACK' }),
      ev(8, 'POINT_AWARDED', 'AWAY', {}),
    ];
    const stats = computeScopeStats(events, sets).teams.HOME;
    // kills 2, errors 1, blocked 1, attempts 4 => (2-1-1)/4 = 0
    expect(stats.totalAttackKills).toBe(2);
    expect(stats.attackErrors).toBe(1);
    expect(stats.blockedAttacks).toBe(1);
    expect(stats.attackAttempts).toBe(4);
    expect(stats.attackEfficiency).toBe(0);
    expect(stats.attackSuccessPercentage).toBe(50);
  });

  it('ace percentage = Service Aces / Total Service Attempts', () => {
    const events: RecordedEvent[] = [
      ev(1, 'ACTION_RECORDED', 'AWAY', { action: 'ACE' }),
      ev(2, 'POINT_AWARDED', 'AWAY', {}),
      ev(3, 'ACTION_RECORDED', 'AWAY', { action: 'SERVICE_ERROR' }),
      ev(4, 'POINT_AWARDED', 'HOME', {}),
      ev(5, 'ACTION_RECORDED', 'AWAY', { action: 'SERVICE_ATTEMPT' }),
    ];
    const stats = computeScopeStats(events, sets).teams.AWAY;
    expect(stats.serviceAces).toBe(1);
    expect(stats.serviceErrors).toBe(1);
    expect(stats.serviceAttempts).toBe(3);
    expect(stats.acePercentage).toBeCloseTo(33.33, 1);
  });

  it('reception efficiency = (Successful Receptions - Reception Errors) / Reception Attempts', () => {
    const events: RecordedEvent[] = [
      ev(1, 'ACTION_RECORDED', 'HOME', { action: 'RECEPTION_SUCCESS' }),
      ev(2, 'ACTION_RECORDED', 'HOME', { action: 'RECEPTION_SUCCESS' }),
      ev(3, 'ACTION_RECORDED', 'HOME', { action: 'RECEPTION_ERROR' }),
    ];
    const stats = computeScopeStats(events, sets).teams.HOME;
    expect(stats.successfulReceptions).toBe(2);
    expect(stats.receptionErrors).toBe(1);
    expect(stats.receptionAttempts).toBe(3);
    expect(stats.receptionEfficiency).toBeCloseTo(0.333, 3);
  });

  it('side-out percentage = Successful Side-outs / Opponent Service Opportunities', () => {
    const events: RecordedEvent[] = [
      ev(1, 'SERVING_TEAM_CHANGED', 'HOME', {}),
      ev(2, 'POINT_AWARDED', 'AWAY', {}), // sideout win for AWAY (HOME served)
      ev(3, 'POINT_AWARDED', 'AWAY', {}), // AWAY serving, wins own serve -> HOME failed sideout attempt
      ev(4, 'POINT_AWARDED', 'HOME', {}), // HOME sideout win on AWAY serve
    ];
    const stats = computeScopeStats(events, sets);
    expect(stats.teams.AWAY.sideoutWins).toBe(1);
    expect(stats.teams.AWAY.sideoutAttempts).toBe(1);
    expect(stats.teams.AWAY.sideOutPercentage).toBe(100);
    expect(stats.teams.HOME.sideoutWins).toBe(1);
    expect(stats.teams.HOME.sideoutAttempts).toBe(2);
    expect(stats.teams.HOME.sideOutPercentage).toBe(50);
  });

  it('break-point performance = points won while opponent served / opponent service points played', () => {
    const events: RecordedEvent[] = [
      ev(1, 'SERVING_TEAM_CHANGED', 'HOME', {}),
      ev(2, 'POINT_AWARDED', 'AWAY', {}), // break/sideout for AWAY on HOME serve
      ev(3, 'POINT_AWARDED', 'AWAY', {}), // AWAY holds serve
      ev(4, 'POINT_AWARDED', 'HOME', {}), // break for HOME on AWAY serve
    ];
    const stats = computeScopeStats(events, sets);
    expect(stats.teams.AWAY.breakPointsWon).toBe(1);
    expect(stats.teams.AWAY.breakPointOpportunities).toBe(1);
    expect(stats.teams.AWAY.breakPointPerformance).toBe(1);
    expect(stats.teams.HOME.breakPointsWon).toBe(1);
    expect(stats.teams.HOME.breakPointOpportunities).toBe(2);
    expect(stats.teams.HOME.breakPointPerformance).toBe(0.5);
  });

  it('returns null for rates when denominator is zero/unavailable (not zero)', () => {
    const events: RecordedEvent[] = [
      ev(1, 'POINT_AWARDED', 'HOME', {}),
    ];
    const stats = computeScopeStats(events, sets).teams.HOME;
    expect(stats.totalPoints).toBe(1);
    expect(stats.attackAttempts).toBeNull();
    expect(stats.attackEfficiency).toBeNull();
    expect(stats.attackSuccessPercentage).toBeNull();
    expect(stats.acePercentage).toBeNull();
    expect(stats.receptionEfficiency).toBeNull();
    // sideout/break may be null if no opponent serve opportunities tracked
  });

  it('distinguishes unavailable data from zero values', () => {
    const noReceptionData = computeScopeStats([ev(1,'POINT_AWARDED','HOME',{})], sets).teams.HOME;
    expect(noReceptionData.receptionAttempts).toBeNull();
    expect(noReceptionData.receptionErrors).toBeNull();
    const zeroReceptionErrors = computeScopeStats([
      ev(1,'ACTION_RECORDED','HOME',{action:'RECEPTION_SUCCESS'}),
      ev(2,'ACTION_RECORDED','HOME',{action:'RECEPTION_SUCCESS'}),
    ], sets).teams.HOME;
    expect(zeroReceptionErrors.receptionAttempts).toBe(2);
    expect(zeroReceptionErrors.receptionErrors).toBe(0);
    expect(zeroReceptionErrors.successfulReceptions).toBe(2);
    expect(zeroReceptionErrors.receptionEfficiency).toBe(1);
  });
});

describe('Set-level and match-level consistency', () => {
  it('provides stats by current/individual set and entire match; totals remain consistent', () => {
    const multiSets: MatchSetInfo[] = [
      { id: 's1', setNumber: 1, homePoints: 25, awayPoints: 20 },
      { id: 's2', setNumber: 2, homePoints: 20, awayPoints: 25 },
    ];
    const events: RecordedEvent[] = [
      ev(1, 'ACTION_RECORDED', 'HOME', { action: 'KILL' }, { setId: 's1' }),
      ev(2, 'POINT_AWARDED', 'HOME', { homePoints: 1, awayPoints: 0 }, { setId: 's1' }),
      ev(3, 'ACTION_RECORDED', 'AWAY', { action: 'ACE' }, { setId: 's1' }),
      ev(4, 'POINT_AWARDED', 'AWAY', { homePoints: 1, awayPoints: 1 }, { setId: 's1' }),
      ev(5, 'ACTION_RECORDED', 'HOME', { action: 'KILL' }, { setId: 's2' }),
      ev(6, 'POINT_AWARDED', 'HOME', { homePoints: 1, awayPoints: 0 }, { setId: 's2' }),
      ev(7, 'ACTION_RECORDED', 'AWAY', { action: 'BLOCK' }, { setId: 's2' }),
    ];
    const analytics = computeMatchAnalytics('m1', events, multiSets, { currentSet: 2 });
    const set1 = analytics.bySet.find(s => s.setNumber === 1)!;
    const set2 = analytics.bySet.find(s => s.setNumber === 2)!;
    expect(set1.teams.HOME.totalAttackKills).toBe(1);
    expect(set2.teams.HOME.totalAttackKills).toBe(1);
    expect(analytics.match.teams.HOME.totalAttackKills).toBe(2);
    expect(set1.teams.AWAY.serviceAces + set2.teams.AWAY.serviceAces).toBe(analytics.match.teams.AWAY.serviceAces);
    expect(set1.teams.AWAY.blockingPoints + set2.teams.AWAY.blockingPoints).toBe(analytics.match.teams.AWAY.blockingPoints);
    expect(analytics.currentSet).toBe(2);
  });

  it('recalculates consistently after corrections/reversals without double-counting', () => {
    const events: RecordedEvent[] = [
      ev(1, 'ACTION_RECORDED', 'HOME', { action: 'KILL' }),
      ev(2, 'POINT_AWARDED', 'HOME', { homePoints: 1, awayPoints: 0 }),
      ev(3, 'ACTION_RECORDED', 'AWAY', { action: 'ACE' }),
      ev(4, 'POINT_AWARDED', 'AWAY', { homePoints: 1, awayPoints: 1 }),
      // correction: reverse event 4 and award corrected point to HOME (compensating events)
      ev(5, 'REVERSAL', 'AWAY', { delta: -1 }, { isReversal: true, correctsEventId: 'e4' }),
      ev(6, 'POINT_AWARDED', 'HOME', { homePoints: 2, awayPoints: 0 }),
      ev(7, 'CORRECTION', 'HOME', { replacementEventId: 'e6' }, { isCorrection: true, correctsEventId: 'e4' }),
    ];
    const stats = computeScopeStats(events, sets);
    // original e4 is marked corrected/reversed and excluded from effective set; compensating reversal + corrected point included
    expect(stats.teams.HOME.totalPoints).toBe(2); // e2 + e6
    expect(stats.teams.AWAY.totalPoints).toBe(0); // e4 excluded, reversal/correction don't add
    const recomputed = computeScopeStats(events, sets);
    expect(recomputed).toEqual(stats);
  });
});

describe('Comparison service', () => {
  it('returns absolute/percentage differences and statistical advantages', () => {
    const events: RecordedEvent[] = [
      ev(1,'ACTION_RECORDED','HOME',{action:'KILL'}), ev(2,'POINT_AWARDED','HOME',{}),
      ev(3,'ACTION_RECORDED','HOME',{action:'KILL'}), ev(4,'POINT_AWARDED','HOME',{}),
      ev(5,'ACTION_RECORDED','AWAY',{action:'KILL'}), ev(6,'POINT_AWARDED','AWAY',{}),
    ];
    const scope = computeScopeStats(events, sets);
    const cmp = buildComparison(scope.teams);
    const kills = cmp.find(m => m.key === 'kills')!;
    expect(kills.home).toBe(2); expect(kills.away).toBe(1);
    expect(kills.absoluteDifference).toBe(1);
    expect(kills.advantage).toBe('HOME');
    expect(kills.percentageDifference).not.toBeNull();
    const errors = cmp.find(m => m.key === 'errors')!;
    expect(errors.higherIsBetter).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { VolleyballMatchEngine, EngineError } from '../src/engine/volleyballEngine.js';

function winSet(engine: VolleyballMatchEngine, winner: 'HOME' | 'AWAY', loserPoints = 20, setNumber?: number) {
  if (setNumber) {
    // ensure correct set context; engine may be between sets
    if (engine.state.status === 'BETWEEN_SETS' || engine.state.currentSetNumber !== setNumber) {
      engine.startSet(setNumber, 'test');
    }
  }
  const target = setNumber === 5 || engine.state.currentSetNumber === 5 ? engine.state.rules.finalSetPoints : engine.state.rules.regularSetPoints;
  // score alternating to keep simple? just award points to winner until set won, give loser some points first
  const set = engine.state.sets.find(s => s.setNumber === engine.state.currentSetNumber)!;
  // award loser points
  for (let i = 0; i < loserPoints; i++) {
    engine.scorePoint(winner === 'HOME' ? 'AWAY' : 'HOME', 'test');
  }
  // award winner points until win condition reached
  let guard = 0;
  while (!(set.winnerSide === winner) && guard++ < 200) {
    engine.scorePoint(winner, 'test');
  }
  return set;
}

describe('VolleyballMatchEngine - normal scoring and set completion', () => {
  it('starts in scheduled/ready state and plays points with rally scoring serve changes', () => {
    const engine = new VolleyballMatchEngine({ homeName: 'A', awayName: 'B', initialServingSide: 'HOME' });
    expect(engine.state.status).toBe('SCHEDULED');
    engine.startMatch('op1');
    expect(engine.state.status).toBe('LIVE');
    expect(engine.state.currentSetNumber).toBe(1);

    engine.scorePoint('HOME', 'op1');
    let set = engine.state.sets[0];
    expect(set.homePoints).toBe(1);
    expect(set.awayPoints).toBe(0);
    expect(set.servingSide).toBe('HOME');

    engine.scorePoint('AWAY', 'op1');
    set = engine.state.sets[0];
    expect(set.homePoints).toBe(1);
    expect(set.awayPoints).toBe(1);
    expect(set.servingSide).toBe('AWAY'); // rally scoring: winner serves
  });

  it('completes a normal set to 25 with 2-point margin and transitions between sets', () => {
    const engine = new VolleyballMatchEngine();
    engine.startMatch('op');
    const set1 = winSet(engine, 'HOME', 18);
    expect(set1.status).toBe('COMPLETED');
    expect(set1.winnerSide).toBe('HOME');
    expect(set1.homePoints).toBeGreaterThanOrEqual(25);
    expect(set1.homePoints - set1.awayPoints).toBeGreaterThanOrEqual(2);
    expect(engine.state.setsWon.HOME).toBe(1);
    expect(engine.state.status).toBe('BETWEEN_SETS');
    expect(engine.state.currentSetNumber).toBe(2);
  });
});

describe('VolleyballMatchEngine - deuce situations', () => {
  it('requires a two-point margin beyond 25 (deuce/advantage)', () => {
    const engine = new VolleyballMatchEngine();
    engine.startMatch('op');
    const set = engine.state.sets[0];
    // bring to 24-24
    for (let i = 0; i < 24; i++) engine.scorePoint('HOME', 'op');
    for (let i = 0; i < 24; i++) engine.scorePoint('AWAY', 'op');
    expect(set.homePoints).toBe(24);
    expect(set.awayPoints).toBe(24);
    expect(set.status).toBe('LIVE');

    engine.scorePoint('HOME', 'op');
    expect(set.homePoints).toBe(25);
    expect(set.awayPoints).toBe(24);
    expect(set.status).toBe('LIVE'); // no 2-point margin yet

    engine.scorePoint('AWAY', 'op');
    expect(set.homePoints).toBe(25);
    expect(set.awayPoints).toBe(25);
    expect(set.status).toBe('LIVE');

    engine.scorePoint('AWAY', 'op');
    engine.scorePoint('AWAY', 'op');
    expect(set.awayPoints - set.homePoints).toBe(2);
    expect(set.winnerSide).toBe('AWAY');
    expect(set.status).toBe('COMPLETED');
  });

  it('uses 15-point target in 5th set but still requires 2-point margin', () => {
    const engine = new VolleyballMatchEngine();
    engine.startMatch('op');
    winSet(engine, 'HOME', 0, 1); // 1-0
    engine.startSet(2, 'op'); winSet(engine, 'AWAY', 0, 2); // 1-1
    engine.startSet(3, 'op'); winSet(engine, 'HOME', 0, 3); // 2-1
    engine.startSet(4, 'op'); winSet(engine, 'AWAY', 0, 4); // 2-2
    expect(engine.state.currentSetNumber).toBe(5);
    engine.startSet(5, 'op');
    const set5 = engine.state.sets.find(s => s.setNumber === 5)!;
    expect(set5.targetPoints).toBe(15);
    for (let i = 0; i < 14; i++) engine.scorePoint('HOME', 'op');
    for (let i = 0; i < 14; i++) engine.scorePoint('AWAY', 'op');
    engine.scorePoint('HOME', 'op');
    expect(set5.status).toBe('LIVE'); // 15-14
    engine.scorePoint('HOME', 'op');
    expect(set5.status).toBe('COMPLETED');
    expect(set5.winnerSide).toBe('HOME');
    expect(set5.homePoints).toBe(16);
    expect(set5.awayPoints).toBe(14);
  });
});

describe('VolleyballMatchEngine - match completion', () => {
  it('completes match when a team wins 3 sets (best of 5)', () => {
    const engine = new VolleyballMatchEngine();
    engine.startMatch('op');
    winSet(engine, 'HOME', 10, 1);
    engine.startSet(2, 'op'); winSet(engine, 'HOME', 12, 2);
    engine.startSet(3, 'op'); winSet(engine, 'AWAY', 8, 3);
    expect(engine.state.status).toBe('BETWEEN_SETS');
    engine.startSet(4, 'op'); winSet(engine, 'HOME', 5, 4);
    expect(engine.state.status).toBe('COMPLETED');
    expect(engine.state.winnerSide).toBe('HOME');
    expect(engine.state.setsWon.HOME).toBe(3);
    expect(engine.state.setsWon.AWAY).toBe(1);
  });
});

describe('VolleyballMatchEngine - invalid operations and limits', () => {
  it('rejects timeout when limit reached and tracks usage per set', () => {
    const engine = new VolleyballMatchEngine();
    engine.startMatch('op');
    engine.callTimeout('HOME', 'op');
    engine.callTimeout('HOME', 'op');
    expect(engine.state.sets[0].timeoutsUsed.HOME).toBe(2);
    expect(() => engine.callTimeout('HOME', 'op')).toThrow(EngineError);
  });

  it('rejects substitution when limit reached and tracks usage per set', () => {
    const engine = new VolleyballMatchEngine({ rules: { substitutionsPerSet: 2 } });
    engine.startMatch('op');
    engine.recordSubstitution('AWAY', 1, 12, 'op');
    engine.recordSubstitution('AWAY', 2, 13, 'op');
    expect(engine.state.sets[0].substitutionsUsed.AWAY).toBe(2);
    expect(() => engine.recordSubstitution('AWAY', 3, 14, 'op')).toThrow(EngineError);
  });

  it('rejects invalid substitution players and operations on completed matches', () => {
    const engine = new VolleyballMatchEngine();
    engine.startMatch('op');
    expect(() => engine.recordSubstitution('HOME', 5, 5, 'op')).toThrow(EngineError);
    // complete quickly
    winSet(engine, 'HOME', 0, 1);
    engine.startSet(2,'op'); winSet(engine, 'HOME', 0, 2);
    engine.startSet(3,'op'); winSet(engine, 'HOME', 0, 3);
    expect(engine.state.status).toBe('COMPLETED');
    expect(() => engine.scorePoint('HOME', 'op')).toThrow(EngineError);
  });

  it('prevents ending a set without valid margin/target', () => {
    const engine = new VolleyballMatchEngine();
    engine.startMatch('op');
    expect(() => engine.endSet('op')).toThrow(EngineError);
    for (let i = 0; i < 25; i++) engine.scorePoint('HOME', 'op');
    for (let i = 0; i < 24; i++) engine.scorePoint('AWAY', 'op');
    // 25-24 not enough margin though target reached for leader
    expect(() => engine.endSet('op')).toThrow(EngineError);
  });
});

describe('VolleyballMatchEngine - corrections and reversals', () => {
  it('records traceable events with sequence numbers and timestamps', () => {
    const engine = new VolleyballMatchEngine();
    engine.startMatch('op-1');
    engine.scorePoint('HOME', 'op-1');
    engine.callTimeout('AWAY', 'op-2');
    const seqs = engine.state.events.map(e => e.sequenceNumber);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect([...seqs].sort((a,b)=>a-b)).toEqual(seqs);
    expect(engine.state.events.every(e => !!e.timestamp && !!e.id)).toBe(true);
    expect(engine.state.events.some(e => e.operatorId === 'op-1')).toBe(true);
  });

  it('reverses a timeout event and restores availability', () => {
    const engine = new VolleyballMatchEngine();
    engine.startMatch('op');
    const before = engine.state.sets[0].timeoutsUsed.HOME;
    engine.callTimeout('HOME', 'op');
    const timeoutEvt = [...engine.state.events].reverse().find(e => e.type === 'TIMEOUT_CALLED')!;
    expect(engine.state.sets[0].timeoutsUsed.HOME).toBe(before + 1);
    const rev = engine.reverseEvent(timeoutEvt.id, 'op', 'mistaken timeout');
    expect(rev.type).toBe('REVERSAL');
    expect(rev.correctsEventId).toBe(timeoutEvt.id);
    expect(engine.state.sets[0].timeoutsUsed.HOME).toBe(before);
  });

  it('corrects a point by replacing the awarded team (appends correction/audit trail)', () => {
    const engine = new VolleyballMatchEngine();
    engine.startMatch('op');
    engine.scorePoint('HOME', 'op');
    const pointEvt = [...engine.state.events].reverse().find(e => e.type === 'POINT_AWARDED')!;
    expect(engine.state.sets[0].homePoints).toBe(1);
    const corr = engine.correctEvent(pointEvt.id, { teamSide: 'AWAY', operatorId: 'ref', note: 'scoring table correction' });
    expect(corr.type).toBe('CORRECTION');
    expect(corr.correctsEventId).toBe(pointEvt.id);
    // net result after reverse+re-award: away has point
    expect(engine.state.sets[0].awayPoints).toBe(1);
    expect(engine.state.events.some(e => e.type === 'REVERSAL' || e.type === 'CORRECTION')).toBe(true);
  });
});

describe('VolleyballMatchEngine - complete simulated match (playable via backend engine)', () => {
  it('plays a full 5-set volleyball match to completion with valid outcomes', () => {
    const engine = new VolleyballMatchEngine({ homeName: 'LIONS', awayName: 'SHARKS', initialServingSide: 'HOME' });
    engine.startMatch('scorer');

    const scoreTo = (side: 'HOME' | 'AWAY', n: number) => {
      for (let i = 0; i < n; i++) engine.scorePoint(side, 'scorer');
    };
    const finishSetFor = (side: 'HOME' | 'AWAY') => {
      const set = engine.state.sets.find(s => s.setNumber === engine.state.currentSetNumber)!;
      let guard = 0;
      while (set.status !== 'COMPLETED' && guard++ < 300) {
        engine.scorePoint(side, 'scorer');
      }
      return set;
    };

    // Set 1: HOME wins 25-20
    scoreTo('AWAY', 20);
    finishSetFor('HOME');
    expect(engine.state.sets.find(s => s.setNumber === 1)?.homePoints).toBe(25);
    expect(engine.state.setsWon.HOME).toBe(1);
    expect(engine.state.status).toBe('BETWEEN_SETS');

    // Set 2: AWAY wins 26-24 (deuce)
    engine.startSet(2, 'scorer');
    scoreTo('HOME', 24);
    scoreTo('AWAY', 24);
    scoreTo('AWAY', 2);
    expect(engine.state.sets.find(s => s.setNumber === 2)?.winnerSide).toBe('AWAY');
    expect(engine.state.setsWon.AWAY).toBe(1);

    // Set 3: HOME wins 25-23
    engine.startSet(3, 'scorer');
    scoreTo('AWAY', 23);
    finishSetFor('HOME');
    expect(engine.state.sets.find(s => s.setNumber === 3)?.homePoints).toBe(25);
    expect(engine.state.setsWon.HOME).toBe(2);

    // Set 4: AWAY wins 25-22
    engine.startSet(4, 'scorer');
    scoreTo('HOME', 22);
    finishSetFor('AWAY');
    expect(engine.state.sets.find(s => s.setNumber === 4)?.awayPoints).toBe(25);
    expect(engine.state.setsWon.AWAY).toBe(2);
    expect(engine.state.currentSetNumber).toBe(5);

    // Set 5: HOME wins 17-15 (final set to 15, 2-point margin)
    engine.startSet(5, 'scorer');
    scoreTo('AWAY', 14);
    scoreTo('HOME', 14);
    scoreTo('AWAY', 1); // 14-15
    scoreTo('HOME', 3); // 17-15
    const set5 = engine.state.sets.find(s => s.setNumber === 5)!;
    expect(set5.status).toBe('COMPLETED');
    expect(set5.homePoints).toBe(17);
    expect(set5.awayPoints).toBe(15);

    expect(engine.state.status).toBe('COMPLETED');
    expect(engine.state.winnerSide).toBe('HOME');
    expect(engine.state.setsWon).toEqual({ HOME: 3, AWAY: 2 });
    const completedSets = engine.state.sets.filter(s => s.status === 'COMPLETED');
    expect(completedSets).toHaveLength(5);
    expect(completedSets.every(s => Math.abs(s.homePoints - s.awayPoints) >= s.minDifference)).toBe(true);
  });
});

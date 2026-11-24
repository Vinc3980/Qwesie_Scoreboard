export type EngineMatchStatus =
  | 'SCHEDULED'
  | 'READY'
  | 'LIVE'
  | 'PAUSED'
  | 'BETWEEN_SETS'
  | 'SUSPENDED'
  | 'COMPLETED'
  | 'CANCELLED';

export type TeamSide = 'HOME' | 'AWAY';

export type EngineEventType =
  | 'POINT_AWARDED'
  | 'ACTION_RECORDED'
  | 'TIMEOUT_CALLED'
  | 'SUBSTITUTION_RECORDED'
  | 'SET_STARTED'
  | 'SET_COMPLETED'
  | 'MATCH_STARTED'
  | 'MATCH_COMPLETED'
  | 'MATCH_STATUS_CHANGED'
  | 'SERVING_TEAM_CHANGED'
  | 'ROTATION_ADVANCED'
  | 'CORRECTION'
  | 'REVERSAL'
  | 'NOTE';

export interface VolleyballRulesConfig {
  bestOfSets: number; // default 5
  setsToWin: number; // default 3
  regularSetPoints: number; // default 25
  finalSetPoints: number; // default 15
  minPointDifference: number; // default 2
  rallyScoring: boolean; // default true
  timeoutsPerSet: number; // default 2
  substitutionsPerSet: number; // default 6
  maxSets: number; // default 5
}

export const DEFAULT_RULES: VolleyballRulesConfig = {
  bestOfSets: 5,
  setsToWin: 3,
  regularSetPoints: 25,
  finalSetPoints: 15,
  minPointDifference: 2,
  rallyScoring: true,
  timeoutsPerSet: 2,
  substitutionsPerSet: 6,
  maxSets: 5,
};

export interface EngineEvent {
  id: string;
  sequenceNumber: number;
  type: EngineEventType;
  setNumber?: number;
  teamSide?: TeamSide;
  operatorId?: string;
  payload?: Record<string, unknown>;
  timestamp: string;
  correctsEventId?: string;
  isCorrection?: boolean;
  isReversal?: boolean;
  note?: string;
  reversedEventId?: string;
}

export interface SetState {
  setNumber: number;
  homePoints: number;
  awayPoints: number;
  targetPoints: number;
  minDifference: number;
  winnerSide?: TeamSide;
  status: 'READY' | 'LIVE' | 'COMPLETED';
  servingSide?: TeamSide;
  timeoutsUsed: Record<TeamSide, number>;
  substitutionsUsed: Record<TeamSide, number>;
  // rotation positions 1-6, values can be player identifiers/jerseys
  rotations: Record<TeamSide, (string | number | null)[]>;
}

export interface TeamMatchStats {
  points: number;
  kills: number;
  errors: number;
  aces: number;
  blocks: number;
  digs: number;
  assists: number;
  timeoutsUsed: number;
  substitutionsUsed: number;
  sideoutAttempts: number;
  sideoutWins: number;
  rotations: number;
}

export interface MatchState {
  id: string;
  status: EngineMatchStatus;
  rules: VolleyballRulesConfig;
  homeName: string;
  awayName: string;
  currentSetNumber: number;
  setsWon: Record<TeamSide, number>;
  servingSide?: TeamSide;
  winnerSide?: TeamSide;
  sets: SetState[];
  teamStats: Record<TeamSide, TeamMatchStats>;
  events: EngineEvent[];
  nextSequence: number;
  nextEventId: number;
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

function other(side: TeamSide): TeamSide {
  return side === 'HOME' ? 'AWAY' : 'HOME';
}

function emptyStats(): TeamMatchStats {
  return {
    points: 0, kills: 0, errors: 0, aces: 0, blocks: 0, digs: 0, assists: 0,
    timeoutsUsed: 0, substitutionsUsed: 0, sideoutAttempts: 0, sideoutWins: 0, rotations: 0,
  };
}

function defaultRotation(): (string | number | null)[] {
  return [null, null, null, null, null, null];
}

export class VolleyballMatchEngine {
  readonly state: MatchState;

  constructor(params?: {
    id?: string;
    homeName?: string;
    awayName?: string;
    rules?: Partial<VolleyballRulesConfig>;
    initialServingSide?: TeamSide;
  }) {
    const rules = { ...DEFAULT_RULES, ...(params?.rules || {}) };
    // enforce consistency
    rules.maxSets = rules.bestOfSets;
    if (rules.setsToWin > Math.ceil(rules.bestOfSets / 2)) {
      rules.setsToWin = Math.ceil(rules.bestOfSets / 2);
    }
    this.state = {
      id: params?.id || `match_${Date.now()}`,
      status: 'SCHEDULED',
      rules,
      homeName: params?.homeName || 'HOME TEAM',
      awayName: params?.awayName || 'AWAY TEAM',
      currentSetNumber: 1,
      setsWon: { HOME: 0, AWAY: 0 },
      servingSide: params?.initialServingSide || 'HOME',
      sets: [],
      teamStats: { HOME: emptyStats(), AWAY: emptyStats() },
      events: [],
      nextSequence: 1,
      nextEventId: 1,
    };
    this.ensureSetExists(1);
  }

  private now() { return new Date().toISOString(); }
  private newEventId() { return `evt_${this.state.nextEventId++}`; }

  private recordEvent(partial: Omit<EngineEvent, 'id' | 'sequenceNumber' | 'timestamp'> & { timestamp?: string }): EngineEvent {
    const evt: EngineEvent = {
      id: this.newEventId(),
      sequenceNumber: this.state.nextSequence++,
      timestamp: partial.timestamp || this.now(),
      ...partial,
    };
    this.state.events.push(evt);
    return evt;
  }

  private ensureSetExists(setNumber: number): SetState {
    let set = this.state.sets.find(s => s.setNumber === setNumber);
    if (!set) {
      const isFinal = setNumber === this.state.rules.bestOfSets;
      set = {
        setNumber,
        homePoints: 0,
        awayPoints: 0,
        targetPoints: isFinal ? this.state.rules.finalSetPoints : this.state.rules.regularSetPoints,
        minDifference: this.state.rules.minPointDifference,
        status: 'READY',
        servingSide: this.state.servingSide,
        timeoutsUsed: { HOME: 0, AWAY: 0 },
        substitutionsUsed: { HOME: 0, AWAY: 0 },
        rotations: { HOME: defaultRotation(), AWAY: defaultRotation() },
      };
      this.state.sets.push(set);
      this.state.sets.sort((a,b)=>a.setNumber-b.setNumber);
    }
    return set;
  }

  private currentSet(): SetState {
    return this.ensureSetExists(this.state.currentSetNumber);
  }

  private requirePlayable() {
    if (this.state.status === 'COMPLETED' || this.state.status === 'CANCELLED') {
      throw new EngineError(`Match is ${this.state.status.toLowerCase()} and cannot accept operations`);
    }
  }

  private requireLiveForScoring() {
    this.requirePlayable();
    if (this.state.status === 'SCHEDULED' || this.state.status === 'READY') {
      // auto-start convenience
      this.startMatch('system');
    }
    if (this.state.status === 'BETWEEN_SETS') {
      this.startSet(this.state.currentSetNumber, 'system');
    }
    if (this.state.status !== 'LIVE') {
      throw new EngineError(`Match must be LIVE to perform this operation (current: ${this.state.status})`);
    }
  }

  startMatch(operatorId = 'system') {
    this.requirePlayable();
    if (this.state.status === 'LIVE') return this.state;
    this.state.status = 'LIVE';
    const set = this.currentSet();
    set.status = 'LIVE';
    set.servingSide = set.servingSide || this.state.servingSide;
    this.recordEvent({ type: 'MATCH_STARTED', operatorId, setNumber: set.setNumber });
    this.recordEvent({ type: 'SET_STARTED', operatorId, setNumber: set.setNumber, teamSide: set.servingSide });
    return this.state;
  }

  startSet(setNumber: number, operatorId = 'system') {
    this.requirePlayable();
    this.state.currentSetNumber = setNumber;
    const set = this.ensureSetExists(setNumber);
    if (this.state.status === 'COMPLETED') throw new EngineError('Match already completed');
    this.state.status = 'LIVE';
    set.status = 'LIVE';
    if (!set.servingSide) set.servingSide = this.state.servingSide;
    this.recordEvent({ type: 'SET_STARTED', operatorId, setNumber, teamSide: set.servingSide });
    return this.state;
  }

  private rotateReceivingTeam(side: TeamSide, operatorId?: string) {
    const set = this.currentSet();
    const rot = set.rotations[side];
    // rotate clockwise: [1,2,3,4,5,6] -> [6,1,2,3,4,5]
    const last = rot[5];
    for (let i = 5; i > 0; i--) rot[i] = rot[i - 1];
    rot[0] = last;
    this.state.teamStats[side].rotations += 1;
    this.recordEvent({ type: 'ROTATION_ADVANCED', teamSide: side, setNumber: set.setNumber, operatorId, payload: { rotation: [...rot] } });
  }

  private awardPointInternal(scoringSide: TeamSide, operatorId = 'system', cause: string = 'RALLY', sourceEventId?: string) {
    this.requireLiveForScoring();
    const set = this.currentSet();
    if (set.status === 'COMPLETED') throw new EngineError('Current set is already completed');

    const prevServer = set.servingSide || this.state.servingSide || 'HOME';
    // side-out tracking: if receiving team wins rally, they attempted a sideout and won it
    if (scoringSide !== prevServer) {
      this.state.teamStats[scoringSide].sideoutAttempts += 1;
      this.state.teamStats[scoringSide].sideoutWins += 1;
      this.rotateReceivingTeam(scoringSide, operatorId);
    } else {
      // serving team won rally; no rotation
      // track opponent sideout attempt? optional, but useful: receiving side attempted and failed on loss-of-rally is implied
      // We'll count failed sideout attempt for receiving team when point is awarded to serving team while they were receiving.
      const receiving = prevServer === scoringSide ? other(scoringSide) : prevServer;
      if (receiving !== scoringSide) {
        this.state.teamStats[receiving].sideoutAttempts += 1;
      }
    }

    if (scoringSide === 'HOME') set.homePoints += 1; else set.awayPoints += 1;
    this.state.teamStats[scoringSide].points += 1;

    // rally scoring: point winner serves next
    if (this.state.rules.rallyScoring) {
      set.servingSide = scoringSide;
      this.state.servingSide = scoringSide;
    } else {
      // side-out scoring fallback (not default): only receiving team can score and gain serve; simplified
      set.servingSide = scoringSide;
      this.state.servingSide = scoringSide;
    }
    this.recordEvent({ type: 'SERVING_TEAM_CHANGED', teamSide: scoringSide, setNumber: set.setNumber, operatorId });

    const pointEvent = this.recordEvent({
      type: 'POINT_AWARDED',
      teamSide: scoringSide,
      setNumber: set.setNumber,
      operatorId,
      payload: { cause, homePoints: set.homePoints, awayPoints: set.awayPoints, sourceEventId },
    });

    this.evaluateSetCompletion(set, operatorId);
    return pointEvent;
  }

  scorePoint(team: TeamSide, operatorId = 'system') {
    const evt = this.awardPointInternal(team, operatorId, 'MANUAL_POINT');
    return { state: this.state, event: evt };
  }

  recordAction(team: TeamSide, action: 'KILL'|'ACE'|'BLOCK'|'DIG'|'ASSIST'|'ATTACK_ERROR', operatorId = 'system') {
    this.requireLiveForScoring();
    const set = this.currentSet();
    const stats = this.state.teamStats[team];
    const map: Record<string, keyof TeamMatchStats | null> = {
      KILL: 'kills', ACE: 'aces', BLOCK: 'blocks', DIG: 'digs', ASSIST: 'assists', 'ATTACK_ERROR': 'errors',
    };
    const field = map[action];
    if (field) (stats[field] as number) += 1;
    const actionEvent = this.recordEvent({ type: 'ACTION_RECORDED', teamSide: team, setNumber: set.setNumber, operatorId, payload: { action } });

    // scoring implications
    if (action === 'KILL' || action === 'ACE' || action === 'BLOCK') {
      this.awardPointInternal(team, operatorId, action, actionEvent.id);
    } else if (action === 'ATTACK_ERROR') {
      this.awardPointInternal(other(team), operatorId, 'ATTACK_ERROR', actionEvent.id);
    }
    return { state: this.state, event: actionEvent };
  }

  callTimeout(team: TeamSide, operatorId = 'system') {
    this.requireLiveForScoring();
    const set = this.currentSet();
    if (set.timeoutsUsed[team] >= this.state.rules.timeoutsPerSet) {
      throw new EngineError(`No timeouts remaining for ${team} in set ${set.setNumber}`);
    }
    set.timeoutsUsed[team] += 1;
    this.state.teamStats[team].timeoutsUsed += 1;
    const evt = this.recordEvent({ type: 'TIMEOUT_CALLED', teamSide: team, setNumber: set.setNumber, operatorId, payload: { timeoutNumber: set.timeoutsUsed[team] } });
    return { state: this.state, event: evt };
  }

  recordSubstitution(team: TeamSide, playerOut: string | number, playerIn: string | number, operatorId = 'system') {
    this.requireLiveForScoring();
    const set = this.currentSet();
    if (set.substitutionsUsed[team] >= this.state.rules.substitutionsPerSet) {
      throw new EngineError(`No substitutions remaining for ${team} in set ${set.setNumber}`);
    }
    if (playerOut === playerIn) throw new EngineError('Substitution players must differ');
    set.substitutionsUsed[team] += 1;
    this.state.teamStats[team].substitutionsUsed += 1;
    const evt = this.recordEvent({
      type: 'SUBSTITUTION_RECORDED', teamSide: team, setNumber: set.setNumber, operatorId,
      payload: { substitutionNo: set.substitutionsUsed[team], playerOut, playerIn },
    });
    return { state: this.state, event: evt };
  }

  isSetWon(homePoints: number, awayPoints: number, targetPoints: number, minDiff: number): TeamSide | null {
    if (homePoints >= targetPoints || awayPoints >= targetPoints) {
      if (homePoints - awayPoints >= minDiff) return 'HOME';
      if (awayPoints - homePoints >= minDiff) return 'AWAY';
    }
    return null;
  }

  private evaluateSetCompletion(set: SetState, operatorId = 'system') {
    if (set.status === 'COMPLETED') return;
    const winner = this.isSetWon(set.homePoints, set.awayPoints, set.targetPoints, set.minDifference);
    if (!winner) return;
    set.status = 'COMPLETED';
    set.winnerSide = winner;
    this.state.setsWon[winner] += 1;
    this.recordEvent({ type: 'SET_COMPLETED', teamSide: winner, setNumber: set.setNumber, operatorId, payload: { homePoints: set.homePoints, awayPoints: set.awayPoints } });
    this.evaluateMatchCompletion(winner, operatorId);
  }

  endSet(operatorId = 'system') {
    this.requireLiveForScoring();
    const set = this.currentSet();
    if (set.homePoints === set.awayPoints) throw new EngineError('Set cannot end tied');
    const winner = set.homePoints > set.awayPoints ? 'HOME' : 'AWAY';
    if (Math.abs(set.homePoints - set.awayPoints) < set.minDifference) {
      throw new EngineError('Set cannot end without required point difference');
    }
    if (set.homePoints < set.targetPoints && set.awayPoints < set.targetPoints) {
      throw new EngineError('Set target points not reached');
    }
    if (set.status !== 'COMPLETED') {
      set.status = 'COMPLETED';
      set.winnerSide = winner;
      this.state.setsWon[winner] += 1;
      this.recordEvent({ type: 'SET_COMPLETED', teamSide: winner, setNumber: set.setNumber, operatorId, payload: { homePoints: set.homePoints, awayPoints: set.awayPoints, manual: true } });
      this.evaluateMatchCompletion(winner, operatorId);
    }
    return { state: this.state };
  }

  private evaluateMatchCompletion(lastSetWinner: TeamSide, operatorId = 'system') {
    const { setsToWin, bestOfSets } = this.state.rules;
    const home = this.state.setsWon.HOME;
    const away = this.state.setsWon.AWAY;
    if (home >= setsToWin || away >= setsToWin || this.state.currentSetNumber >= bestOfSets) {
      // if reached max sets played and someone leads by sets after completion logic, decide; normally setsToWin resolves earlier except edge configs
      if (home >= setsToWin || away >= setsToWin) {
        this.state.status = 'COMPLETED';
        this.state.winnerSide = home > away ? 'HOME' : 'AWAY';
        this.recordEvent({ type: 'MATCH_COMPLETED', teamSide: this.state.winnerSide, operatorId, payload: { setsWon: { ...this.state.setsWon } } });
        return;
      }
    }
    // transition to next set
    if (this.state.status !== 'COMPLETED') {
      this.state.status = 'BETWEEN_SETS';
      this.state.currentSetNumber += 1;
      const next = this.ensureSetExists(this.state.currentSetNumber);
      // next set ready; serving side can be set explicitly by rules/coin toss in future; keep last set winner as default placeholder? better keep previous or undefined
      next.status = 'READY';
      next.servingSide = this.state.servingSide;
      this.recordEvent({ type: 'MATCH_STATUS_CHANGED', operatorId, payload: { status: 'BETWEEN_SETS', nextSet: this.state.currentSetNumber } });
    }
  }

  setStatus(status: EngineMatchStatus, operatorId = 'system') {
    this.state.status = status;
    this.recordEvent({ type: 'MATCH_STATUS_CHANGED', operatorId, payload: { status } });
    return this.state;
  }

  // Event correction: append a correction event referencing prior event and apply compensating state change for supported types
  correctEvent(eventId: string, correction: { teamSide?: TeamSide; note?: string; operatorId?: string; payload?: Record<string, unknown> }) {
    const target = this.state.events.find(e => e.id === eventId);
    if (!target) throw new EngineError('Event not found');
    if (target.isReversal) throw new EngineError('Cannot correct a reversal event');
    // limited correction support: for POINT_AWARDED allow changing awarded team by reversing and re-awarding
    if (target.type === 'POINT_AWARDED' && correction.teamSide && target.teamSide && correction.teamSide !== target.teamSide) {
      // reverse original point effect minimally
      this.reversePointEvent(target, correction.operatorId || 'system', 'Correction reversal');
      const newPoint = this.awardPointInternal(correction.teamSide, correction.operatorId || 'system', 'CORRECTED_POINT', target.id);
      const corr = this.recordEvent({ type: 'CORRECTION', operatorId: correction.operatorId, correctsEventId: target.id, isCorrection: true, teamSide: correction.teamSide, payload: { ...(correction.payload||{}), replacementEventId: newPoint.id }, note: correction.note });
      target.correctsEventId = corr.id; // mark relation
      return corr;
    }
    const corr = this.recordEvent({ type: 'CORRECTION', operatorId: correction.operatorId, correctsEventId: target.id, isCorrection: true, teamSide: correction.teamSide, payload: correction.payload, note: correction.note || 'Correction recorded' });
    return corr;
  }

  // Reversal: append reversal event and attempt to undo supported event effects
  reverseEvent(eventId: string, operatorId = 'system', note?: string) {
    const target = this.state.events.find(e => e.id === eventId);
    if (!target) throw new EngineError('Event not found');
    if (target.type === 'POINT_AWARDED') {
      this.reversePointEvent(target, operatorId, note);
      const rev = this.recordEvent({ type: 'REVERSAL', operatorId, correctsEventId: target.id, isReversal: true, teamSide: target.teamSide, payload: { reversedEventId: target.id }, note: note || 'Point reversed' });
      return rev;
    }
    if (target.type === 'TIMEOUT_CALLED' && target.teamSide) {
      const set = this.state.sets.find(s => s.setNumber === target.setNumber) || this.currentSet();
      if (set.timeoutsUsed[target.teamSide] > 0) set.timeoutsUsed[target.teamSide] -= 1;
      if (this.state.teamStats[target.teamSide].timeoutsUsed > 0) this.state.teamStats[target.teamSide].timeoutsUsed -= 1;
      const rev = this.recordEvent({ type: 'REVERSAL', operatorId, correctsEventId: target.id, isReversal: true, teamSide: target.teamSide, payload: { reversedEventId: target.id }, note: note || 'Timeout reversed' });
      return rev;
    }
    if (target.type === 'SUBSTITUTION_RECORDED' && target.teamSide) {
      const set = this.state.sets.find(s => s.setNumber === target.setNumber) || this.currentSet();
      if (set.substitutionsUsed[target.teamSide] > 0) set.substitutionsUsed[target.teamSide] -= 1;
      if (this.state.teamStats[target.teamSide].substitutionsUsed > 0) this.state.teamStats[target.teamSide].substitutionsUsed -= 1;
      const rev = this.recordEvent({ type: 'REVERSAL', operatorId, correctsEventId: target.id, isReversal: true, teamSide: target.teamSide, payload: { reversedEventId: target.id }, note: note || 'Substitution reversed' });
      return rev;
    }
    // generic reversal record
    const rev = this.recordEvent({ type: 'REVERSAL', operatorId, correctsEventId: target.id, isReversal: true, teamSide: target.teamSide, payload: { reversedEventId: target.id }, note: note || 'Event reversed (record only)' });
    return rev;
  }

  private reversePointEvent(target: EngineEvent, operatorId: string, note?: string) {
    if (target.type !== 'POINT_AWARDED' || !target.teamSide) throw new EngineError('Only point events can be reversed by this method');
    const set = this.state.sets.find(s => s.setNumber === target.setNumber) || this.currentSet();
    if (set.status === 'COMPLETED' || this.state.status === 'COMPLETED') {
      throw new EngineError('Reversing points on completed set/match requires explicit correction workflow');
    }
    if (target.teamSide === 'HOME') set.homePoints = Math.max(0, set.homePoints - 1);
    else set.awayPoints = Math.max(0, set.awayPoints - 1);
    this.state.teamStats[target.teamSide].points = Math.max(0, this.state.teamStats[target.teamSide].points - 1);
    // best-effort: serving side/state not perfectly reconstructed without full replay; keep current serving but record note
    this.recordEvent({ type: 'NOTE', operatorId, setNumber: set.setNumber, payload: { note: note || 'Point reversed; serving/rotation may require manual verification' } });
  }

  getSnapshot() {
    return JSON.parse(JSON.stringify(this.state)) as MatchState;
  }
}

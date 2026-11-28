/**
 * Volleyball statistics engine.
 *
 * All statistics are derived from recorded match events. Recalculation always
 * starts from the event stream, so corrections/reversals do not double-count.
 *
 * Formulas (documented as required):
 * - Attack efficiency = (Kills - Attack Errors - Blocked Attacks) / Total Attack Attempts
 * - Attack success %  = Kills / Total Attack Attempts
 * - Ace %             = Service Aces / Total Service Attempts
 * - Reception efficiency = (Successful Receptions - Reception Errors) / Reception Attempts
 *   (positive receptions treated as successful when explicit "perfect/positive" split unavailable)
 * - Side-out %        = Successful Side-outs / Opponent Service Opportunities (receiving-side sideout attempts)
 * - Break-point performance = Points won while opponent served / Opponent serve points played (scoring opportunities)
 *
 * Zero/unavailable handling:
 * - If a denominator is 0 or source data for a metric is not present in events, the
 *   calculated rate/percentage is `null` (unavailable), never coerced to 0.
 * - Raw counts remain numeric and represent events actually recorded.
 */

export type Side = 'HOME' | 'AWAY';

export interface RecordedEvent {
  id?: string;
  sequenceNumber: number;
  type: string;
  teamSide?: Side | null;
  setId?: string | null;
  setNumber?: number | null;
  payload?: any;
  isCorrection?: boolean;
  isReversal?: boolean;
  correctsEventId?: string | null;
  eventTimestamp?: string | Date;
}

export interface MatchSetInfo {
  id?: string;
  setNumber: number;
  homePoints: number;
  awayPoints: number;
  status?: string;
}

export interface PlayerIdentity {
  id: string;
  name: string;
  jerseyNumber?: number | string | null;
  side: Side;
}

export interface PlayerStats {
  playerId: string;
  name: string;
  side: Side;
  jerseyNumber?: number | string | null;
  points: number | null;
  attackKills: number | null;
  attackAttempts: number | null;
  attackErrors: number | null;
  blockedAttacks: number | null;
  serviceAces: number | null;
  serviceErrors: number | null;
  serviceAttempts: number | null;
  blocks: number | null;
  digs: number | null;
  assists: number | null;
  receptionAttempts: number | null;
  receptionErrors: number | null;
  successfulReceptions: number | null;
  playingTimeSeconds: number | null; // unavailable unless tracked by events
  attackEfficiency: number | null;
  attackSuccessPct: number | null;
  acePct: number | null;
  receptionEfficiency: number | null;
}

export interface TeamStats {
  side: Side;
  totalPoints: number;
  totalAttackKills: number;
  attackAttempts: number | null;
  attackErrors: number;
  blockedAttacks: number | null;
  attackEfficiency: number | null;
  attackSuccessPercentage: number | null;
  serviceAces: number;
  serviceErrors: number | null;
  serviceAttempts: number | null;
  acePercentage: number | null;
  blockingPoints: number;
  digs: number;
  assists: number;
  receptionAttempts: number | null;
  receptionErrors: number | null;
  successfulReceptions: number | null;
  receptionEfficiency: number | null;
  sideOutPercentage: number | null;
  sideoutAttempts: number;
  sideoutWins: number;
  breakPointPerformance: number | null; // ratio 0..1 or null
  breakPointsWon: number | null;
  breakPointOpportunities: number | null;
  errors: number; // total team errors recorded
  longestScoringStreak: number;
  timeoutsUsed: number;
  substitutionsUsed: number;
}

export interface ComparisonMetric {
  key: string;
  label: string;
  home: number | null;
  away: number | null;
  absoluteDifference: number | null;
  percentageDifference: number | null; // relative to average/base where meaningful, else null
  advantage: Side | 'EVEN' | 'UNAVAILABLE';
  higherIsBetter: boolean;
}

export interface ScopeStats {
  scope: 'set' | 'match';
  setNumber?: number;
  teams: Record<Side, TeamStats>;
  players: Record<Side, PlayerStats[]>;
  comparison: ComparisonMetric[];
}

export interface ProgressionPoint {
  seq: number;
  setNumber?: number;
  side?: Side;
  homePoints: number;
  awayPoints: number;
  label?: string;
}

export interface MatchAnalytics {
  matchId: string;
  currentSet?: number;
  bySet: ScopeStats[];
  match: ScopeStats;
  progression: ProgressionPoint[];
  formulas: Record<string, string>;
}

const other: Record<Side, Side> = { HOME: 'AWAY', AWAY: 'HOME' };

function isNum(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
function div(n: number, d: number): number | null { return d > 0 ? n / d : null; }
function pct(n: number, d: number): number | null { const r = div(n, d); return r == null ? null : r * 100; }
function round(v: number | null, digits = 2): number | null { return v == null ? null : Number(v.toFixed(digits)); }
function nOrNull(v: number | null): number | null { return v == null ? null : v; }

function countIfKnown(values: Array<number | undefined>): number | null {
  // If no values were tracked at all, unavailable. If tracked (even 0), sum.
  const present = values.filter((v): v is number => v !== undefined);
  if (present.length === 0) return null;
  return present.reduce((a,b)=>a+b,0);
}

export function buildSetNumberMap(sets: MatchSetInfo[], events: RecordedEvent[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sets) if (s.id) map.set(s.id, s.setNumber);
  // allow events to carry explicit setNumber
  for (const e of events) if (e.setId && isNum(e.setNumber)) map.set(e.setId, e.setNumber as number);
  return map;
}

function baseTeam(): Omit<TeamStats, 'side' | 'attackEfficiency' | 'attackSuccessPercentage' | 'acePercentage' | 'receptionEfficiency' | 'sideOutPercentage' | 'breakPointPerformance'> & { _attackAttemptsKnown?: number; _serviceAttemptsKnown?: number; _blockedAttacksKnown?: number; _serviceErrorsKnown?: number; _receptionAttemptsKnown?: number; _receptionErrorsKnown?: number; _successfulReceptionsKnown?: number; _breakPointsWon?: number; _breakPointOpps?: number; _oppServePointsPlayed?: number; _pointsWonOnOppServe?: number } {
  return {
    totalPoints: 0,
    totalAttackKills: 0,
    attackAttempts: null,
    attackErrors: 0,
    blockedAttacks: null,
    serviceAces: 0,
    serviceErrors: null,
    serviceAttempts: null,
    blockingPoints: 0,
    digs: 0,
    assists: 0,
    receptionAttempts: null,
    receptionErrors: null,
    successfulReceptions: null,
    sideoutAttempts: 0,
    sideoutWins: 0,
    breakPointsWon: null,
    breakPointOpportunities: null,
    errors: 0,
    longestScoringStreak: 0,
    timeoutsUsed: 0,
    substitutionsUsed: 0,
    _attackAttemptsKnown: 0,
    _serviceAttemptsKnown: 0,
    _blockedAttacksKnown: 0,
    _serviceErrorsKnown: 0,
    _receptionAttemptsKnown: 0,
    _receptionErrorsKnown: 0,
    _successfulReceptionsKnown: 0,
    _pointsWonOnOppServe: 0,
    _oppServePointsPlayed: 0,
  } as any;
}

function finalizeTeam(side: Side, t: any, hasAnyAttemptEvents: {attack:boolean;service:boolean;reception:boolean;blocked:boolean;serviceErr:boolean}): TeamStats {
  const attackAttempts = hasAnyAttemptEvents.attack ? (t._attackAttemptsKnown || 0) : null;
  const serviceAttempts = hasAnyAttemptEvents.service ? (t._serviceAttemptsKnown || 0) : null;
  const blockedAttacks = hasAnyAttemptEvents.blocked ? (t._blockedAttacksKnown || 0) : null;
  const serviceErrors = hasAnyAttemptEvents.serviceErr ? (t._serviceErrorsKnown || 0) : null;
  const receptionAttempts = hasAnyAttemptEvents.reception ? (t._receptionAttemptsKnown || 0) : null;
  const receptionErrors = hasAnyAttemptEvents.reception ? (t._receptionErrorsKnown || 0) : null;
  const successfulReceptions = hasAnyAttemptEvents.reception ? (t._successfulReceptionsKnown || 0) : null;
  const breakOpps = t._oppServePointsPlayed || 0;
  const breakWon = t._pointsWonOnOppServe || 0;

  return {
    side,
    totalPoints: t.totalPoints,
    totalAttackKills: t.totalAttackKills,
    attackAttempts,
    attackErrors: t.attackErrors,
    blockedAttacks,
    attackEfficiency: attackAttempts != null ? round(div(t.totalAttackKills - t.attackErrors - (blockedAttacks || 0), attackAttempts), 3) : null,
    attackSuccessPercentage: attackAttempts != null ? round(pct(t.totalAttackKills, attackAttempts), 2) : null,
    serviceAces: t.serviceAces,
    serviceErrors,
    serviceAttempts,
    acePercentage: serviceAttempts != null ? round(pct(t.serviceAces, serviceAttempts), 2) : null,
    blockingPoints: t.blockingPoints,
    digs: t.digs,
    assists: t.assists,
    receptionAttempts,
    receptionErrors,
    successfulReceptions,
    receptionEfficiency: receptionAttempts != null ? round(div((successfulReceptions || 0) - (receptionErrors || 0), receptionAttempts), 3) : null,
    sideOutPercentage: round(pct(t.sideoutWins, t.sideoutAttempts), 2),
    sideoutAttempts: t.sideoutAttempts,
    sideoutWins: t.sideoutWins,
    breakPointPerformance: breakOpps > 0 ? round(div(breakWon, breakOpps), 3) : null,
    breakPointsWon: breakOpps > 0 ? breakWon : null,
    breakPointOpportunities: breakOpps > 0 ? breakOpps : null,
    errors: t.errors,
    longestScoringStreak: t.longestScoringStreak,
    timeoutsUsed: t.timeoutsUsed || 0,
    substitutionsUsed: t.substitutionsUsed || 0,
  };
}

export function computeScopeStats(
  events: RecordedEvent[],
  sets: MatchSetInfo[],
  opts?: { setNumber?: number; players?: PlayerIdentity[] }
): ScopeStats {
  const scope: 'set' | 'match' = opts?.setNumber ? 'set' : 'match';
  const setNumber = opts?.setNumber;
  const setIdByNumber = new Map(sets.map(s => [s.setNumber, s.id]));
  const numberBySetId = buildSetNumberMap(sets, events);
  const targetSetId = setNumber ? setIdByNumber.get(setNumber) : undefined;

  const sorted = [...events].sort((a,b)=>a.sequenceNumber-b.sequenceNumber);
  const filtered = sorted.filter(e => {
    if (!setNumber) return true;
    const sn = e.setNumber ?? (e.setId ? numberBySetId.get(e.setId) : undefined);
    if (sn != null) return sn === setNumber;
    // include events linked by target set id
    if (targetSetId && e.setId) return e.setId === targetSetId;
    return false;
  });

  // Build correction/reversal application: recompute from effective events.
  // Strategy: ignore events that are corrections/reversals markers except their payload effect? 
  // For this engine, we treat POINT_CORRECTED/POINT_REVERSED/CORRECTION/REVERSAL as indicators and
  // prefer explicit compensating events in stream. To avoid double-counting, we also skip any
  // event that has been corrected/reversed by a later effective correction/reversal event targeting it.
  const correctedOrReversed = new Set<string>();
  for (const e of filtered) {
    if ((e.type === 'CORRECTION' || e.type === 'REVERSAL' || e.isCorrection || e.isReversal || e.type === 'POINT_CORRECTED' || e.type === 'POINT_REVERSED') && e.correctsEventId) {
      correctedOrReversed.add(e.correctsEventId);
    }
  }
  const effective = filtered.filter(e => !(e.id && correctedOrReversed.has(e.id)));

  const teams: Record<Side, any> = { HOME: baseTeam(), AWAY: baseTeam() };
  const flags = { attack: false, service: false, reception: false, blocked: false, serviceErr: false };
  let currentServer: Side | null = null;
  const streak: Record<Side, number> = { HOME: 0, AWAY: 0 };

  // Player stats (only when identities and/or player-tagged events exist)
  const playerMap = new Map<string, PlayerStats & { _known: any }>();
  for (const p of (opts?.players || [])) {
    playerMap.set(p.id, {
      playerId: p.id, name: p.name, side: p.side, jerseyNumber: p.jerseyNumber ?? null,
      points: 0, attackKills: 0, attackAttempts: null, attackErrors: 0, blockedAttacks: null,
      serviceAces: 0, serviceErrors: null, serviceAttempts: null, blocks: 0, digs: 0, assists: 0,
      receptionAttempts: null, receptionErrors: null, successfulReceptions: null,
      playingTimeSeconds: null, attackEfficiency: null, attackSuccessPct: null, acePct: null, receptionEfficiency: null,
      _known: { attack:false, service:false, reception:false, blocked:false, serviceErr:false }
    });
  }
  const getPlayer = (id?: string, side?: Side) => {
    if (!id) return null;
    if (!playerMap.has(id)) {
      // create anonymous from event only if explicitly tracked
      playerMap.set(id, {
        playerId: id, name: `Player ${id}`, side: side || 'HOME', jerseyNumber: null,
        points: 0, attackKills: 0, attackAttempts: null, attackErrors: 0, blockedAttacks: null,
        serviceAces: 0, serviceErrors: null, serviceAttempts: null, blocks: 0, digs: 0, assists: 0,
        receptionAttempts: null, receptionErrors: null, successfulReceptions: null,
        playingTimeSeconds: null, attackEfficiency: null, attackSuccessPct: null, acePct: null, receptionEfficiency: null,
        _known: { attack:false, service:false, reception:false, blocked:false, serviceErr:false }
      });
    }
    return playerMap.get(id)!;
  };

  const applyPoint = (side: Side) => {
    teams[side].totalPoints += 1;
    streak[side] += 1; streak[other[side]] = 0;
    teams[side].longestScoringStreak = Math.max(teams[side].longestScoringStreak, streak[side]);
    // break point: scoring while opponent is serving
    if (currentServer && currentServer === other[side]) {
      teams[side]._pointsWonOnOppServe += 1;
      teams[side]._oppServePointsPlayed += 1;
      // opponent's serve point ended as break for them? tracked on rally end below
      teams[other[side]]._oppServePointsPlayed = (teams[other[side]]._oppServePointsPlayed || 0); // ensure exists
    } else if (currentServer && currentServer === side) {
      // server won point (not a break point opportunity converted by receiver, but point played on own serve)
      // break-point "opportunity" is usually when receiving; we track receiving-side opportunities as opponent serve points played for receiver
    }
  };

  for (const e of effective) {
    const side = (e.teamSide as Side) || null;
    const p = e.payload || {};
    const action = String(p.action || '').toUpperCase();
    const player = getPlayer(p.playerId, side || undefined);

    if (e.type === 'SERVING_TEAM_CHANGED' && side) currentServer = side;

    // Rally/point context for break points and sideouts from POINT_AWARDED
    if (e.type === 'POINT_AWARDED' && side) {
      // If server known and point scored by receiver, count receiving sideout attempt/win and receiver break opportunity
      if (currentServer) {
        if (side !== currentServer) {
          teams[side].sideoutAttempts += 1;
          teams[side].sideoutWins += 1;
          teams[side]._oppServePointsPlayed += 1; // receiving opportunity
          teams[side]._pointsWonOnOppServe += 1;   // converted break/sideout point
        } else {
          // server held serve; receiving side had sideout attempt that failed
          teams[other[side]].sideoutAttempts += 1;
          teams[other[side]]._oppServePointsPlayed += 1;
        }
      }
      // current server becomes point winner in rally scoring
      currentServer = side;
      applyPoint(side);
      if (player) { player.points = (player.points || 0) + 1; }
      continue;
    }

    // Corrections/reversals that carry explicit point deltas in payload (fallback support)
    if ((e.type === 'CORRECTION' || e.type === 'REVERSAL' || e.type === 'POINT_CORRECTED' || e.type === 'POINT_REVERSED') && side) {
      const delta = isNum(p.delta) ? p.delta : (isNum(p.pointsDelta) ? p.pointsDelta : 0);
      if (delta !== 0) {
        teams[side].totalPoints = Math.max(0, teams[side].totalPoints + delta);
        if (player && isNum(player.points)) player.points = Math.max(0, (player.points || 0) + delta);
      }
      // other stat deltas if provided
      continue;
    }

    if (e.type === 'TIMEOUT_CALLED' && side) {
      teams[side].timeoutsUsed = (teams[side].timeoutsUsed || 0) + 1;
      continue;
    }

    if (e.type === 'SUBSTITUTION_RECORDED' && side) {
      teams[side].substitutionsUsed = (teams[side].substitutionsUsed || 0) + 1;
      continue;
    }

    if (e.type === 'ACTION_RECORDED' && side) {
      // attempts: explicit attempt events or infer basic attempts from terminal attack actions
      if (action === 'ATTACK_ATTEMPT' || p.attackAttempt) { teams[side]._attackAttemptsKnown += (isNum(p.count)?p.count:1); flags.attack = true; if (player){ player._known.attack=true; player.attackAttempts=(player.attackAttempts||0)+(isNum(p.count)?p.count:1);} }
      if (action === 'SERVICE_ATTEMPT' || p.serviceAttempt) { teams[side]._serviceAttemptsKnown += (isNum(p.count)?p.count:1); flags.service = true; if (player){ player._known.service=true; player.serviceAttempts=(player.serviceAttempts||0)+(isNum(p.count)?p.count:1);} }
      if (action === 'RECEPTION_ATTEMPT') { teams[side]._receptionAttemptsKnown += (isNum(p.count)?p.count:1); flags.reception = true; if (player){ player._known.reception=true; player.receptionAttempts=(player.receptionAttempts||0)+(isNum(p.count)?p.count:1);} }

      if (action === 'KILL') {
        teams[side].totalAttackKills += 1; teams[side]._attackAttemptsKnown += 1; flags.attack = true;
        if (player){ player._known.attack=true; player.attackKills=(player.attackKills||0)+1; player.attackAttempts=(player.attackAttempts||0)+1; }
        if (p.assistPlayerId) { const ap = getPlayer(p.assistPlayerId, side); teams[side].assists += 1; if (ap) ap.assists = (ap.assists || 0) + 1; }
      } else if (action === 'ATTACK_ERROR') {
        teams[side].attackErrors += 1; teams[side].errors += 1; teams[side]._attackAttemptsKnown += 1; flags.attack = true;
        if (player){ player._known.attack=true; player.attackErrors=(player.attackErrors||0)+1; player.attackAttempts=(player.attackAttempts||0)+1; }
      } else if (action === 'BLOCKED_ATTACK') {
        teams[side]._blockedAttacksKnown += 1; teams[side]._attackAttemptsKnown += 1; flags.attack = true; flags.blocked = true;
        if (player){ player._known.attack=true; player._known.blocked=true; player.blockedAttacks=(player.blockedAttacks||0)+1; player.attackAttempts=(player.attackAttempts||0)+1; }
      } else if (action === 'ACE') {
        teams[side].serviceAces += 1; teams[side]._serviceAttemptsKnown += 1; flags.service = true;
        if (player){ player._known.service=true; player.serviceAces=(player.serviceAces||0)+1; player.serviceAttempts=(player.serviceAttempts||0)+1; }
      } else if (action === 'SERVICE_ERROR') {
        teams[side]._serviceErrorsKnown += 1; teams[side]._serviceAttemptsKnown += 1; teams[side].errors += 1; flags.service = true; flags.serviceErr = true;
        if (player){ player._known.service=true; player._known.serviceErr=true; player.serviceErrors=(player.serviceErrors||0)+1; player.serviceAttempts=(player.serviceAttempts||0)+1; }
      } else if (action === 'BLOCK' || action === 'BLOCK_POINT') {
        teams[side].blockingPoints += 1;
        if (player) player.blocks = (player.blocks || 0) + 1;
      } else if (action === 'DIG') {
        teams[side].digs += 1; if (player) player.digs = (player.digs || 0) + 1;
      } else if (action === 'ASSIST') {
        teams[side].assists += 1; if (player) player.assists = (player.assists || 0) + 1;
      } else if (action === 'RECEPTION_ERROR') {
        teams[side]._receptionErrorsKnown += 1; teams[side]._receptionAttemptsKnown += 1; teams[side].errors += 1; flags.reception = true;
        if (player){ player._known.reception=true; player.receptionErrors=(player.receptionErrors||0)+1; player.receptionAttempts=(player.receptionAttempts||0)+1; }
      } else if (action === 'RECEPTION_SUCCESS' || action === 'SUCCESSFUL_RECEPTION') {
        teams[side]._successfulReceptionsKnown += 1; teams[side]._receptionAttemptsKnown += 1; flags.reception = true;
        if (player){ player._known.reception=true; player.successfulReceptions=(player.successfulReceptions||0)+1; player.receptionAttempts=(player.receptionAttempts||0)+1; }
      } else if (action === 'ERROR') {
        teams[side].errors += 1;
      }
      // points for scoring actions are accounted via POINT_AWARDED events in our match service; do not double count here
      continue;
    }

    if (e.type === 'NOTE' && action === 'PLAYING_TIME' && player && isNum(p.seconds)) {
      // explicit playing time tracking
      if (player.playingTimeSeconds == null) player.playingTimeSeconds = 0;
      player.playingTimeSeconds += p.seconds;
    }
  }

  const teamStats: Record<Side, TeamStats> = {
    HOME: finalizeTeam('HOME', teams.HOME, flags),
    AWAY: finalizeTeam('AWAY', teams.AWAY, flags),
  };

  const players: Record<Side, PlayerStats[]> = { HOME: [], AWAY: [] };
  for (const ps of playerMap.values()) {
    const known = ps._known || {};
    const attackAttempts = known.attack ? (ps.attackAttempts || 0) : null;
    const serviceAttempts = known.service ? (ps.serviceAttempts || 0) : null;
    const blockedAttacks = known.blocked ? (ps.blockedAttacks || 0) : null;
    const serviceErrors = known.serviceErr ? (ps.serviceErrors || 0) : (known.service ? (ps.serviceErrors || 0) : null);
    const receptionAttempts = known.reception ? (ps.receptionAttempts || 0) : null;
    const receptionErrors = known.reception ? (ps.receptionErrors || 0) : null;
    const successfulReceptions = known.reception ? (ps.successfulReceptions || 0) : null;
    const finalized: PlayerStats = {
      playerId: ps.playerId, name: ps.name, side: ps.side, jerseyNumber: ps.jerseyNumber ?? null,
      points: nOrNull(ps.points), attackKills: nOrNull(ps.attackKills), attackAttempts,
      attackErrors: nOrNull(ps.attackErrors), blockedAttacks,
      serviceAces: nOrNull(ps.serviceAces), serviceErrors, serviceAttempts,
      blocks: nOrNull(ps.blocks), digs: nOrNull(ps.digs), assists: nOrNull(ps.assists),
      receptionAttempts, receptionErrors, successfulReceptions,
      playingTimeSeconds: ps.playingTimeSeconds == null ? null : ps.playingTimeSeconds,
      attackEfficiency: attackAttempts != null ? round(div((ps.attackKills||0) - (ps.attackErrors||0) - (blockedAttacks||0), attackAttempts), 3) : null,
      attackSuccessPct: attackAttempts != null ? round(pct(ps.attackKills||0, attackAttempts), 2) : null,
      acePct: serviceAttempts != null ? round(pct(ps.serviceAces||0, serviceAttempts), 2) : null,
      receptionEfficiency: receptionAttempts != null ? round(div((successfulReceptions||0) - (receptionErrors||0), receptionAttempts), 3) : null,
    };
    players[ps.side].push(finalized);
  }

  return {
    scope,
    setNumber,
    teams: teamStats,
    players,
    comparison: buildComparison(teamStats),
  };
}

export function buildComparison(teams: Record<Side, TeamStats>): ComparisonMetric[] {
  const metrics: Array<[string,string, number|null, number|null, boolean, boolean]> = [
    ['totalPoints','Total Points', teams.HOME.totalPoints, teams.AWAY.totalPoints, true, false],
    ['kills','Total Attack Kills', teams.HOME.totalAttackKills, teams.AWAY.totalAttackKills, true, false],
    ['attackAttempts','Attack Attempts', teams.HOME.attackAttempts, teams.AWAY.attackAttempts, true, false],
    ['attackEfficiency','Attack Efficiency', teams.HOME.attackEfficiency, teams.AWAY.attackEfficiency, true, true],
    ['attackSuccessPct','Attack Success %', teams.HOME.attackSuccessPercentage, teams.AWAY.attackSuccessPercentage, true, true],
    ['aces','Service Aces', teams.HOME.serviceAces, teams.AWAY.serviceAces, true, false],
    ['serviceErrors','Service Errors', teams.HOME.serviceErrors, teams.AWAY.serviceErrors, false, false],
    ['blocks','Blocking Points', teams.HOME.blockingPoints, teams.AWAY.blockingPoints, true, false],
    ['digs','Digs', teams.HOME.digs, teams.AWAY.digs, true, false],
    ['assists','Assists', teams.HOME.assists, teams.AWAY.assists, true, false],
    ['receptionEfficiency','Reception Efficiency', teams.HOME.receptionEfficiency, teams.AWAY.receptionEfficiency, true, true],
    ['sideOutPct','Side-out %', teams.HOME.sideOutPercentage, teams.AWAY.sideOutPercentage, true, true],
    ['breakPoint','Break-point Performance', teams.HOME.breakPointPerformance, teams.AWAY.breakPointPerformance, true, true],
    ['errors','Errors', teams.HOME.errors, teams.AWAY.errors, false, false],
    ['streak','Longest Scoring Streak', teams.HOME.longestScoringStreak, teams.AWAY.longestScoringStreak, true, false],
  ];
  return metrics.map(([key,label,home,away,higherIsBetter,ratio]) => {
    const abs = (home==null || away==null) ? null : round(home - away, 3);
    let pctDiff: number | null = null;
    if (home!=null && away!=null) {
      const base = ratio ? Math.max(Math.abs(home), Math.abs(away), 1e-9) : ((Math.abs(home)+Math.abs(away))/2);
      pctDiff = base === 0 ? null : round(((home-away)/base)*100, 2);
    }
    let advantage: Side | 'EVEN' | 'UNAVAILABLE' = 'UNAVAILABLE';
    if (home!=null && away!=null) {
      if (home === away) advantage = 'EVEN';
      else if (higherIsBetter) advantage = home > away ? 'HOME' : 'AWAY';
      else advantage = home < away ? 'HOME' : 'AWAY';
    }
    return { key, label, home, away, absoluteDifference: abs, percentageDifference: pctDiff, advantage, higherIsBetter };
  });
}

export function computeProgression(events: RecordedEvent[], sets: MatchSetInfo[]): ProgressionPoint[] {
  const sorted = [...events].sort((a,b)=>a.sequenceNumber-b.sequenceNumber);
  const numberBySetId = buildSetNumberMap(sets, events);
  let home = 0, away = 0, currentSet = 1;
  const points: ProgressionPoint[] = [{ seq: 0, setNumber: 1, homePoints: 0, awayPoints: 0, label: 'Start' }];
  for (const e of sorted) {
    const sn = e.setNumber ?? (e.setId ? numberBySetId.get(e.setId) : undefined);
    if (sn && sn !== currentSet) { currentSet = sn; home = 0; away = 0; }
    if (e.type === 'SET_STARTED' && sn) { currentSet = sn; home = 0; away = 0; points.push({ seq: e.sequenceNumber, setNumber: currentSet, homePoints: home, awayPoints: away, label: `Set ${currentSet}` }); continue; }
    if (e.type === 'POINT_AWARDED') {
      const payload = e.payload || {};
      // prefer payload scores if present
      if (typeof payload.homePoints === 'number' && typeof payload.awayPoints === 'number') {
        home = payload.homePoints; away = payload.awayPoints;
      } else if (e.teamSide === 'HOME') home++; else if (e.teamSide === 'AWAY') away++;
      points.push({ seq: e.sequenceNumber, setNumber: sn || currentSet, side: e.teamSide as any, homePoints: home, awayPoints: away, label: e.teamSide ? `${e.teamSide} point` : 'Point' });
    }
    if (e.type === 'SET_COMPLETED' || e.type === 'MATCH_COMPLETED') {
      points.push({ seq: e.sequenceNumber, setNumber: sn || currentSet, homePoints: home, awayPoints: away, label: e.type.replace('_',' ') });
    }
  }
  return points;
}

export function computeMatchAnalytics(matchId: string, events: RecordedEvent[], sets: MatchSetInfo[], opts?: { players?: PlayerIdentity[]; currentSet?: number }): MatchAnalytics {
  const bySet = [...sets].sort((a,b)=>a.setNumber-b.setNumber).map(s => computeScopeStats(events, sets, { setNumber: s.setNumber, players: opts?.players }));
  const match = computeScopeStats(events, sets, { players: opts?.players });
  return {
    matchId,
    currentSet: opts?.currentSet,
    bySet,
    match,
    progression: computeProgression(events, sets),
    formulas: {
      attackEfficiency: '(Kills - Attack Errors - Blocked Attacks) / Total Attack Attempts',
      attackSuccessPercentage: 'Kills / Total Attack Attempts',
      acePercentage: 'Service Aces / Total Service Attempts',
      receptionEfficiency: '(Successful Receptions - Reception Errors) / Reception Attempts',
      sideOutPercentage: 'Successful Side-outs / Opponent Service Opportunities',
      breakPointPerformance: 'Points won while opponent served / Opponent service points played (receiving opportunities)',
    },
  };
}

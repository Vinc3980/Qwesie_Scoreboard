import { prisma, withDbRetry } from '../config/database.js';
import { MatchState, MatchStatePatch, MatchEventData, TeamId, MatchSetupInput, MatchInfoInput, MatchStatus, MatchFlags, TeamMatchState, PlayerOnCourt, SetHistoryItem, MatchRosterEntryInput, MatchReadiness, ReadinessChecklistItem, StartSetInput, applyMatchStatePatch } from '@qwesie/shared';
import { ACTION_STAT_MAP, SCORING_ACTIONS, DEFAULT_TEAMS, DEFAULT_TOURNAMENT, DEFAULT_DIVISION, DEFAULT_COURT, DEFAULT_MATCH_NO, parseBulkPlayerRows } from '@qwesie/shared';
import { normalizeCourt } from '../utils/court.js';
import { setCourtOnAir } from '../controllers/court.controller.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { resolveStoredUrl } from '../storage/index.js';
import { broadcastMatchState, broadcastMatchSnapshot, broadcastMatchStatePatch } from '../sockets/socketManager.js';
import { onMatchEventCommitted } from './broadcast.service.js';
import { invalidateStandingsCache } from './standings.service.js';
import {
  getCachedMatchState,
  getOrLoadMatchState,
  peekCachedMatchState,
  setCachedMatchState,
  invalidateMatchState,
  updateCachedMatchState,
  scheduleMatchStateRefresh,
} from './matchStateCache.js';

type Side = 'HOME' | 'AWAY';
type Tx = any;

const sideFromTeam = (team: TeamId): Side => (team === 'A' ? 'HOME' : 'AWAY');
const teamFromSide = (side: Side | null | undefined): TeamId => (side === 'AWAY' ? 'B' : 'A');
const otherTeam = (team: TeamId): TeamId => (team === 'A' ? 'B' : 'A');
const otherSide = (side: Side): Side => (side === 'HOME' ? 'AWAY' : 'HOME');
const clean = (v: unknown, fb: string, max: number) => (String(v ?? '').trim() || fb).slice(0, max);
const cleanOpt = (v: unknown, max: number) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : undefined;
};

export function normalizeSideParam(side: string): Side {
  const s = String(side || '').toUpperCase();
  if (s === 'A' || s === 'HOME') return 'HOME';
  if (s === 'B' || s === 'AWAY') return 'AWAY';
  throw new AppError("side must be 'A', 'B', 'HOME', or 'AWAY'", 400);
}

function rulesetDefaults(ruleset?: string) {
  if (ruleset === 'BO3') return { bestOfSets: 3, setsToWin: 2, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, timeoutsPerSet: 2, substitutionsPerSet: 6 };
  if (ruleset === 'FIVB_BO5') return { bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, timeoutsPerSet: 2, substitutionsPerSet: 6 };
  return null;
}

function parseDateTime(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

export class MatchService {
  // ---------- helpers ----------
  private static targetPoints(match: any, setNumber: number) {
    return setNumber === (match.bestOfSets || 5) ? (match.finalSetPoints || 15) : (match.regularSetPoints || 25);
  }

  private static async resolveTeam(tx: Tx, teamId?: string, fallbackName?: string) {
    if (teamId) {
      const t = await tx.team.findUnique({ where: { id: teamId } });
      if (t) return { id: t.id, name: t.name };
    }
    if (fallbackName) return { id: undefined, name: clean(fallbackName, DEFAULT_TEAMS.A, 60) };
    return null;
  }

  private static async upsertOfficials(tx: Tx, matchId: string, referee1?: string, referee2?: string) {
    const refs = [
      referee1 != null ? { role: 'FIRST_REFEREE', name: String(referee1 || '').trim() } : null,
      referee2 != null ? { role: 'SECOND_REFEREE', name: String(referee2 || '').trim() } : null,
    ].filter(Boolean) as Array<{ role: string; name: string }>;
    for (const r of refs) {
      const existing = await tx.matchOfficial.findFirst({ where: { matchId, role: r.role } });
      if (!r.name) {
        if (existing) await tx.matchOfficial.delete({ where: { id: existing.id } });
        continue;
      }
      if (existing) await tx.matchOfficial.update({ where: { id: existing.id }, data: { fullName: r.name } });
      else await tx.matchOfficial.create({ data: { matchId, role: r.role, fullName: r.name } });
    }
  }

  private static async applySetupData(tx: Tx, matchId: string, data: MatchSetupInput) {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError('Match not found', 404);

    const update: any = {};
    const preset = rulesetDefaults(data.ruleset);
    if (preset) Object.assign(update, preset);
    if (data.ruleset) update.ruleset = data.ruleset;

    if (data.homeTeamId) {
      const t = await tx.team.findUnique({ where: { id: data.homeTeamId } });
      if (t) { (update as any).homeTeam = { connect: { id: t.id } }; update.homeTeamName = t.name; }
    } else if (data.homeTeamId === null) {
      (update as any).homeTeam = { disconnect: true };
    } else if (data.team_a) update.homeTeamName = clean(data.team_a, DEFAULT_TEAMS.A, 60);

    if (data.awayTeamId) {
      const t = await tx.team.findUnique({ where: { id: data.awayTeamId } });
      if (t) { (update as any).awayTeam = { connect: { id: t.id } }; update.awayTeamName = t.name; }
    } else if (data.awayTeamId === null) {
      (update as any).awayTeam = { disconnect: true };
    } else if (data.team_b) update.awayTeamName = clean(data.team_b, DEFAULT_TEAMS.B, 60);

    if (data.competitionId !== undefined) {
      if (data.competitionId) {
        (update as any).competition = { connect: { id: data.competitionId } };
        const c = await tx.competition.findUnique({ where: { id: data.competitionId } });
        if (c?.name) update.tournamentName = c.name; // display fallback
      } else {
        (update as any).competition = { disconnect: true };
      }
    }
    if (data.tournamentId !== undefined) {
      if (data.tournamentId) {
        (update as any).tournament = { connect: { id: data.tournamentId } };
        const t = await tx.tournament.findUnique({ where: { id: data.tournamentId } });
        if (t?.name) update.tournamentName = t.name;
      } else {
        (update as any).tournament = { disconnect: true };
      }
    }
    if (data.tournament && !data.tournamentId && !data.competitionId) update.tournamentName = clean(data.tournament, DEFAULT_TOURNAMENT, 120);
    if (data.division !== undefined) update.division = clean(data.division, DEFAULT_DIVISION, 60);
    if (data.court !== undefined) update.court = clean(data.court, DEFAULT_COURT, 40);
    if (data.venueType !== undefined) (update as any).venueType = cleanOpt(data.venueType, 30) || null;
    if (data.ruleset) (update as any).ruleset = data.ruleset;
    if (data.match_no !== undefined) update.matchNumber = clean(data.match_no, DEFAULT_MATCH_NO, 20);

    const sched = parseDateTime(data.scheduledAt || data.match_date);
    if (sched) update.scheduledAt = sched;

    for (const k of ['bestOfSets','setsToWin','regularSetPoints','finalSetPoints','minPointDifference','timeoutsPerSet','substitutionsPerSet'] as const) {
      if ((data as any)[k] != null) update[k] = (data as any)[k];
    }
    if (data.confirmSetEnd !== undefined) update.confirmSetEnd = !!data.confirmSetEnd;

    await this.safeUpdate(tx, 'match', { where: { id: matchId }, data: update });

    if (data.referee1 !== undefined || data.referee2 !== undefined) {
      await this.upsertOfficials(tx, matchId, data.referee1, data.referee2);
    }

    // keep sets config in sync for a not-started match
    const m2 = await tx.match.findUnique({ where: { id: matchId }, include: { sets: true } });
    if (m2 && ['SCHEDULED','READY'].includes(m2.status)) {
      const bestOfSets = m2.bestOfSets || 5;
      for (let n = 1; n <= bestOfSets; n++) {
        const target = n === bestOfSets ? (m2.finalSetPoints || 15) : (m2.regularSetPoints || 25);
        await tx.matchSet.upsert({
          where: { matchId_setNumber: { matchId, setNumber: n } },
          update: { targetPoints: target, minDifference: m2.minPointDifference || 2 },
          create: { matchId, setNumber: n, homePoints: 0, awayPoints: 0, targetPoints: target, minDifference: m2.minPointDifference || 2, status: n === 1 ? 'READY' : 'READY', servingSide: m2.servingSide || 'HOME' },
        });
      }
      // remove extra sets if reduced bestOfSets
      await tx.matchSet.deleteMany({ where: { matchId, setNumber: { gt: bestOfSets } } });
      await tx.match.update({ where: { id: matchId }, data: { currentSetNumber: 1, setsWonHome: 0, setsWonAway: 0 } });
    }

    await this.bumpRevision(tx, matchId);
    return m2;
  }

  private static async nextMatchNumber(competitionId: string | null, day: Date): Promise<string> {
    const start = new Date(day); start.setHours(0,0,0,0);
    const end = new Date(day); end.setHours(23,59,59,999);
    const where: any = { createdAt: { gte: start, lte: end } };
    if (competitionId) where.competitionId = competitionId;
    const rows = await prisma.match.findMany({ where, select: { matchNumber: true } });
    let max = 0;
    for (const r of rows) {
      const n = parseInt(String(r.matchNumber || '').replace(/\D/g, ''), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return String(max + 1);
  }

  static async findInPlayCourtConflict(court: string | null | undefined, excludeMatchId?: string) {
    const key = normalizeCourt(court);
    if (!key) return null;
    const rows = await prisma.match.findMany({
      where: { status: { in: ['LIVE','PAUSED','BETWEEN_SETS','SUSPENDED'] as any }, court: { not: null }, ...(excludeMatchId ? { id: { not: excludeMatchId } } : {}) },
      select: { id: true, court: true, status: true, matchNumber: true, homeTeamName: true, awayTeamName: true },
      take: 200,
    });
    return rows.find(r => normalizeCourt(r.court) === key) || null;
  }

  static async createMatch(data: MatchSetupInput = {}): Promise<string> {
    const preset = rulesetDefaults(data.ruleset) || {};
    const bestOfSets = data.bestOfSets ?? (preset as any).bestOfSets ?? 5;
    const setsToWin = data.setsToWin ?? (preset as any).setsToWin ?? 3;
    const regularSetPoints = data.regularSetPoints ?? (preset as any).regularSetPoints ?? 25;
    const finalSetPoints = data.finalSetPoints ?? (preset as any).finalSetPoints ?? 15;
    const minPointDifference = data.minPointDifference ?? (preset as any).minPointDifference ?? 2;
    const timeoutsPerSet = data.timeoutsPerSet ?? (preset as any).timeoutsPerSet ?? 2;
    const substitutionsPerSet = data.substitutionsPerSet ?? (preset as any).substitutionsPerSet ?? 6;

    const match = await prisma.$transaction(async (tx) => {
      const home = await this.resolveTeam(tx, data.homeTeamId, data.team_a || DEFAULT_TEAMS.A);
      const away = await this.resolveTeam(tx, data.awayTeamId, data.team_b || DEFAULT_TEAMS.B);
      const homeName = home?.name || clean(data.team_a, DEFAULT_TEAMS.A, 60);
      const awayName = away?.name || clean(data.team_b, DEFAULT_TEAMS.B, 60);

      let tournamentName = clean(data.tournament, DEFAULT_TOURNAMENT, 120);
      let competitionId = data.competitionId || null;
      let tournamentId = data.tournamentId || null;
      if (competitionId) { const c = await tx.competition.findUnique({ where: { id: competitionId } }); if (c?.name) tournamentName = c.name; }
      if (tournamentId) { const t = await tx.tournament.findUnique({ where: { id: tournamentId } }); if (t?.name) tournamentName = t.name; if (t?.competitionId && !competitionId) competitionId = t.competitionId; }

      const scheduledAt = parseDateTime(data.scheduledAt || data.match_date) || null;
      const matchNumber = data.match_no
        ? clean(data.match_no, String(await this.nextMatchNumber(competitionId, scheduledAt || new Date())), 20)
        : clean(await this.nextMatchNumber(competitionId, scheduledAt || new Date()), '1', 20);

      const createData: any = {
          homeTeam: home?.id ? { connect: { id: home.id } } : undefined,
          awayTeam: away?.id ? { connect: { id: away.id } } : undefined,
          competition: competitionId ? { connect: { id: competitionId } } : undefined,
          tournament: tournamentId ? { connect: { id: tournamentId } } : undefined,
          homeTeamName: homeName,
          awayTeamName: awayName,
          tournamentName,
          division: clean(data.division, DEFAULT_DIVISION, 60),
          court: clean(data.court, DEFAULT_COURT, 40),
          venueType: (cleanOpt(data.venueType, 30) || null) as any,
          ruleset: (data.ruleset || null) as any,
          matchNumber,
          scheduledAt,
          status: 'SCHEDULED',
          currentSetNumber: 1,
          servingSide: 'HOME',
          setsWonHome: 0,
          setsWonAway: 0,
          revision: 1,
          bestOfSets, setsToWin, regularSetPoints, finalSetPoints, minPointDifference,
          rallyScoring: true,
          timeoutsPerSet, substitutionsPerSet,
          confirmSetEnd: (data as any).confirmSetEnd !== false,
          sets: {
            create: Array.from({ length: bestOfSets }, (_, i) => ({
              setNumber: i + 1,
              homePoints: 0,
              awayPoints: 0,
              targetPoints: i + 1 === bestOfSets ? finalSetPoints : regularSetPoints,
              minDifference: minPointDifference,
              status: 'READY',
              servingSide: 'HOME',
            })),
          },
          teamStatistics: { create: [{ side: 'HOME' }, { side: 'AWAY' }] },
        };
      const m = await this.safeCreateMatch(tx, { data: createData, select: { id: true } });

      if (data.referee1 !== undefined || data.referee2 !== undefined) {
        await this.upsertOfficials(tx, m.id, data.referee1, data.referee2);
      }
      await this.createEvent(tx, m.id, { type: 'NOTE', payload: { note: 'Match created (SCHEDULED)' } });
      return m;
    });

    return match.id;
  }

  static async getCurrentMatch(): Promise<string> {
    const match = await prisma.match.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (match) return match.id;
    return this.createMatch();
  }

  /**
   * Best match for a single-match output (/overlay/scorebug): live first, then
   * the next scheduled match, then the latest finished match.
   */
  static async getActiveMatch(): Promise<{ matchId: string; status: string } | null> {
    const live = await prisma.match.findFirst({
      where: { status: { in: ['LIVE', 'PAUSED', 'BETWEEN_SETS', 'SUSPENDED'] as any } },
      orderBy: [{ startedAt: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, status: true },
    });
    if (live) return { matchId: live.id, status: live.status };
    const next = await prisma.match.findFirst({
      where: { status: { in: ['READY', 'SCHEDULED'] as any } },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, status: true },
    });
    if (next) return { matchId: next.id, status: next.status };
    const done = await prisma.match.findFirst({
      where: { status: 'COMPLETED' as any },
      orderBy: [{ endedAt: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, status: true },
    });
    return done ? { matchId: done.id, status: done.status } : null;
  }

  static async listMatches(): Promise<MatchState[]> {
    // Lightweight summaries: the console list only needs identity/status/teams,
    // not the full event/roster/lineup graph. This used to call getMatchState()
    // once per match (N+1), i.e. hundreds of queries on every 5s poll.
    const rows = await withDbRetry(() => prisma.match.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, status: true, winnerSide: true, currentSetNumber: true, bestOfSets: true,
        setsToWin: true, regularSetPoints: true, finalSetPoints: true, minPointDifference: true,
        rallyScoring: true, timeoutsPerSet: true, substitutionsPerSet: true, confirmSetEnd: true,
        servingSide: true, setsWonHome: true, setsWonAway: true, revision: true,
        tournamentName: true, division: true, court: true, venueType: true,
        competitionId: true, tournamentId: true, matchNumber: true, scheduledAt: true,
        startedAt: true, endedAt: true, createdAt: true, homeTeamName: true, awayTeamName: true,
        homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true, logoKey: true, logoThumbKey: true, primaryColor: true, secondaryColor: true, textColor: true } },
        awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true, logoKey: true, logoThumbKey: true, primaryColor: true, secondaryColor: true, textColor: true } },
        sets: { select: { setNumber: true, homePoints: true, awayPoints: true, winnerSide: true, pendingEnd: true }, orderBy: { setNumber: 'asc' } },
        _count: { select: { rosters: true } },
      },
    }), 'listMatches');

    const teamFromSide = (side: 'HOME' | 'AWAY' | null | undefined): TeamId => (side === 'AWAY' ? 'B' : 'A');
    const emptyTeam = (name: string, team: any, sets: number, score: number): TeamMatchState => ({
      id: team?.id,
      name: team?.name || name,
      shortName: team?.shortName || name.slice(0, 4).toUpperCase(),
      logoUrl: resolveStoredUrl(team?.logoKey) || resolveStoredUrl(team?.logoUrl) || null,
      primaryColor: team?.primaryColor || null,
      secondaryColor: team?.secondaryColor || null,
      textColor: team?.textColor || null,
      score,
      sets,
      timeouts: 0,
      timeoutsUsed: 0,
      timeoutsPerSet: 2,
      substitutionsUsed: 0,
      substitutionsPerSet: 6,
      stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 },
      lineup: [],
      bench: [],
      rotationOrder: [null, null, null, null, null, null],
      serverPosition: null,
    } as TeamMatchState);

    return rows.map((m: any) => {
      const cur = m.sets.find((s: any) => s.setNumber === m.currentSetNumber) || m.sets[0];
      const setScoresA = Array.from({ length: 5 }, (_, i) => m.sets.find((s: any) => s.setNumber === i + 1)?.homePoints ?? 0);
      const setScoresB = Array.from({ length: 5 }, (_, i) => m.sets.find((s: any) => s.setNumber === i + 1)?.awayPoints ?? 0);
      return {
        id: m.id,
        status: m.status,
        winner: m.winnerSide ? teamFromSide(m.winnerSide) : null,
        teams: {
          A: emptyTeam(m.homeTeamName || 'HOME TEAM', m.homeTeam, m.setsWonHome || 0, cur?.homePoints || 0),
          B: emptyTeam(m.awayTeamName || 'AWAY TEAM', m.awayTeam, m.setsWonAway || 0, cur?.awayPoints || 0),
        },
        current_set: m.currentSetNumber,
        max_sets: m.bestOfSets,
        set_scores: { A: setScoresA, B: setScoresB },
        setHistory: m.sets.map((s: any) => ({ number: s.setNumber, scoreA: s.homePoints, scoreB: s.awayPoints, winner: s.winnerSide ? teamFromSide(s.winnerSide) : null, pendingEnd: !!s.pendingEnd })),
        server: teamFromSide(m.servingSide),
        tournament: m.tournamentName || '',
        competitionName: m.competition?.name || m.tournamentName || null,
        competitionLogoUrl: resolveStoredUrl((m.competition as any)?.logoKey) || resolveStoredUrl((m.competition as any)?.logoThumbKey) || resolveStoredUrl((m.competition as any)?.logoUrl) || null,
        division: m.division || '',
        round: (m as any).round || null,
        court: m.court || '',
        venueType: m.venueType || null,
        competitionId: m.competitionId || null,
        tournamentId: m.tournamentId || null,
        match_no: m.matchNumber || '',
        match_date: m.scheduledAt ? new Date(m.scheduledAt).toISOString().slice(0, 10) : '',
        scheduledAt: m.scheduledAt ? new Date(m.scheduledAt).toISOString() : null,
        referee1: '',
        referee2: '',
        started_at: m.startedAt ? new Date(m.startedAt).toISOString() : '',
        ended_at: m.endedAt ? new Date(m.endedAt).toISOString() : null,
        createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
        server_time: new Date().toISOString(),
        events: [],
        flags: { setPoint: null, matchPoint: null, setWon: null, matchWon: null, pendingEnd: false, courtSwitchDue: false, isDecidingSet: false, technicalTimeoutDue: false },
        revision: m.revision,
        lastEvent: null,
        rules: {
          bestOfSets: m.bestOfSets, setsToWin: m.setsToWin, regularSetPoints: m.regularSetPoints,
          finalSetPoints: m.finalSetPoints, minPointDifference: m.minPointDifference, rallyScoring: m.rallyScoring,
          timeoutsPerSet: m.timeoutsPerSet, substitutionsPerSet: m.substitutionsPerSet, confirmSetEnd: m.confirmSetEnd !== false,
        },
      } as MatchState;
    });
  }

  // ---------- readiness / go-live ----------
  static async getReadiness(matchId: string): Promise<MatchReadiness> {
    const match = await prisma.match.findUnique({ where: { id: matchId }, include: { rosters: true, lineups: true, homeTeam: true, awayTeam: true } });
    if (!match) throw new AppError('Match not found', 404);
    const checklist: ReadinessChecklistItem[] = [];
    const homeSet = !!(match.homeTeamId || match.homeTeamName);
    const awaySet = !!(match.awayTeamId || match.awayTeamName);
    checklist.push({ key: 'teams', ok: homeSet && awaySet, message: homeSet && awaySet ? 'Both teams are set' : 'Both teams must be set' });

    const sides: Side[] = ['HOME', 'AWAY'];
    for (const side of sides) {
      const roster = match.rosters.filter(r => r.side === side);
      const rosterOk = roster.length >= 6;
      checklist.push({ key: `roster_${side}`, ok: rosterOk, message: rosterOk ? `${side} roster has ${roster.length} players` : `${side} roster must have at least 6 players` });
      const lineup = match.lineups.filter(l => l.side === side && l.setNumber === 1).sort((a,b)=>a.rotationPos-b.rotationPos);
      const positions = lineup.map(l => l.rotationPos);
      const uniqPos = new Set(positions);
      const lineupRosterIds = new Set(roster.map(r => r.playerId));
      const playersValid = lineup.length === 6 && uniqPos.size === 6 && positions.every(p => p >= 1 && p <= 6) && lineup.every(l => lineupRosterIds.has(l.playerId));
      const liberosInLineup = lineup.filter(l => roster.find(r => r.playerId === l.playerId)?.isLibero).length;
      const ok = playersValid && liberosInLineup <= 1;
      checklist.push({ key: `lineup_${side}_set1`, ok, message: ok ? `${side} has a valid starting six for set 1` : `${side} must have a valid starting six for set 1 (6 rostered players, positions 1-6, max 1 libero)` });
    }

    const ready = checklist.every(c => c.ok);
    const canGoLive = ready && !['LIVE','COMPLETED','CANCELLED'].includes(match.status);
    return { matchId, ready, canGoLive, checklist };
  }

  static async getTeamSheet(matchId: string) {
    const m: any = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true, matchNumber: true, scheduledAt: true, court: true, venueType: true, currentSetNumber: true,
        competition: { select: { name: true, logoKey: true, logoThumbKey: true, logoUrl: true } },
        tournament: { select: { name: true } },
        tournamentName: true, division: true,
        homeTeam: { select: { id: true, name: true, shortName: true, logoKey: true, logoUrl: true, logoThumbKey: true, primaryColor: true, secondaryColor: true, textColor: true, coachName: true, coachPhotoKey: true, assistantCoachName: true, managerName: true, teamPhotoKey: true } },
        awayTeam: { select: { id: true, name: true, shortName: true, logoKey: true, logoUrl: true, logoThumbKey: true, primaryColor: true, secondaryColor: true, textColor: true, coachName: true, coachPhotoKey: true, assistantCoachName: true, managerName: true, teamPhotoKey: true } },
        homeTeamName: true, awayTeamName: true,
        officials: { select: { role: true, fullName: true } },
        sets: { select: { setNumber: true, status: true, homePoints: true, awayPoints: true, winnerSide: true }, orderBy: { setNumber: 'asc' } },
        rosters: {
          select: {
            side: true, jerseyNumber: true, isCaptain: true, isLibero: true, isActive: true,
            player: { select: { id: true, displayName: true, firstName: true, lastName: true, position: true, photoKey: true, thumbKey: true, photoUrl: true } },
          },
        },
        lineups: {
          select: {
            side: true, setNumber: true, rotationPos: true, playerId: true,
            player: { select: { id: true, displayName: true, firstName: true, lastName: true, jerseyNumber: true, position: true, photoKey: true, thumbKey: true, photoUrl: true } },
          },
          orderBy: [{ setNumber: 'asc' }, { rotationPos: 'asc' }],
        },
      },
    });
    if (!m) throw new AppError('Match not found', 404);

    const photo = (p: any) => {
      const url = resolveStoredUrl(p?.photoKey) || resolveStoredUrl(p?.photoUrl) || null;
      const thumb = resolveStoredUrl(p?.thumbKey) || url;
      return { photoUrl: url, thumbUrl: thumb };
    };
    const teamSheet = (side: Side) => {
      const team = side === 'HOME' ? m.homeTeam : m.awayTeam;
      const fallbackName = side === 'HOME' ? m.homeTeamName : m.awayTeamName;
      const roster = m.rosters.filter((r: any) => r.side === side).map((r: any) => {
        const ph = photo(r.player);
        return {
          playerId: r.player?.id,
          jerseyNumber: r.jerseyNumber,
          name: r.player?.displayName || `${r.player?.firstName || ''} ${r.player?.lastName || ''}`.trim(),
          position: r.player?.position || null,
          isCaptain: !!r.isCaptain,
          isLibero: !!r.isLibero,
          photoUrl: ph.photoUrl, thumbUrl: ph.thumbUrl,
        };
      }).sort((a: any, b: any) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999));
      const lineupRows = m.lineups.filter((l: any) => l.side === side);
      const setNumbers = Array.from(new Set<number>(lineupRows.map((l: any) => Number(l.setNumber)))).sort((a, b) => a - b);
      const sets = setNumbers.map((sn) => {
        const slots = lineupRows.filter((l: any) => l.setNumber === sn).sort((a: any, b: any) => a.rotationPos - b.rotationPos).map((l: any) => {
          const ph = photo(l.player);
          return {
            rotationPos: l.rotationPos,
            playerId: l.playerId,
            jerseyNumber: roster.find((r: any) => r.playerId === l.playerId)?.jerseyNumber ?? l.player?.jerseyNumber ?? null,
            name: l.player?.displayName || `${l.player?.firstName || ''} ${l.player?.lastName || ''}`.trim(),
            photoUrl: ph.photoUrl, thumbUrl: ph.thumbUrl,
          };
        });
        return { setNumber: sn, slots };
      });
      const logoUrl = resolveStoredUrl(team?.logoKey) || resolveStoredUrl(team?.logoUrl) || null;
      const coachPhotoUrl = resolveStoredUrl(team?.coachPhotoKey) || null;
      const teamPhotoUrl = resolveStoredUrl(team?.teamPhotoKey) || null;
      return {
        side: side === 'HOME' ? 'A' : 'B',
        teamId: team?.id || null,
        name: team?.name || fallbackName || (side === 'HOME' ? 'Home' : 'Away'),
        shortName: team?.shortName || null,
        logoUrl,
        primaryColor: team?.primaryColor || null,
        secondaryColor: team?.secondaryColor || null,
        textColor: team?.textColor || null,
        coachName: team?.coachName || null,
        coachPhotoUrl,
        assistantCoachName: team?.assistantCoachName || null,
        managerName: team?.managerName || null,
        teamPhotoUrl,
        roster,
        setLineups: sets,
      };
    };

    const firstRef = m.officials.find((o: any) => /1/.test(String(o.role)))?.fullName || m.officials[0]?.fullName || null;
    const secondRef = m.officials.find((o: any) => /2/.test(String(o.role)))?.fullName || m.officials[1]?.fullName || null;
    return {
      matchId: m.id,
      matchNumber: m.matchNumber || null,
      scheduledAt: m.scheduledAt?.toISOString?.() || m.scheduledAt || null,
      competition: m.competition?.name || m.tournamentName || null,
      division: m.division || null,
      court: m.court || null,
      venueType: m.venueType || null,
      referee1: firstRef,
      referee2: secondRef,
      sets: m.sets.map((s: any) => ({ setNumber: s.setNumber, status: s.status, homePoints: s.homePoints, awayPoints: s.awayPoints, winnerSide: s.winnerSide })),
      teams: { A: teamSheet('HOME'), B: teamSheet('AWAY') },
    };
  }

  static async goLive(matchId: string): Promise<MatchState> {
    const readiness = await this.getReadiness(matchId);
    if (!readiness.ready) {
      const missing = readiness.checklist.filter(c => !c.ok).map(c => c.message);
      throw new AppError(`Match is not ready: ${missing.join('; ')}`, 400);
    }
    const existing = await prisma.match.findUnique({ where: { id: matchId }, select: { id: true, court: true, status: true } });
    if (!existing) throw new AppError('Match not found', 404);
    if (['COMPLETED', 'CANCELLED'].includes(existing.status)) throw new AppError('Match cannot go live from current status', 400);
    const conflict = await this.findInPlayCourtConflict(existing.court, matchId);
    if (conflict) {
      throw new AppError('Another match is already in play on this court', 409, { code: 'COURT_CONFLICT', conflict, court: existing.court });
    }
    await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId }, include: { sets: true } });
      if (!match) throw new AppError('Match not found', 404);
      if (['COMPLETED','CANCELLED'].includes(match.status)) throw new AppError('Match cannot go live from current status', 400);
      const courtKey = normalizeCourt(match.court);
      if (courtKey) {
        const candidates = await tx.match.findMany({
          where: { id: { not: matchId }, status: { in: ['LIVE','PAUSED','BETWEEN_SETS','SUSPENDED'] as any }, court: { not: null } },
          select: { id: true, court: true, status: true, matchNumber: true, homeTeamName: true, awayTeamName: true },
          take: 200,
        });
        const conflictInTx = candidates.find((c: any) => normalizeCourt(c.court) === courtKey);
        if (conflictInTx) throw new AppError('Another match is already in play on this court', 409, { code: 'COURT_CONFLICT', conflict: conflictInTx, court: match.court });
      }
      const set1 = match.sets.find(s => s.setNumber === 1);
      if (set1) await tx.matchSet.update({ where: { id: set1.id }, data: { status: 'LIVE', startedAt: set1.startedAt || new Date() } });
      await tx.match.update({ where: { id: matchId }, data: { status: 'LIVE', startedAt: match.startedAt || new Date(), currentSetNumber: 1 } });
      await this.createEvent(tx, matchId, { type: 'MATCH_STARTED', teamSide: (match.servingSide || 'HOME') as Side, payload: { note: 'Match set LIVE' } });
      await this.bumpRevision(tx, matchId);
    });
    if (existing.court) await setCourtOnAir(existing.court, matchId).catch(() => {});
    await onMatchEventCommitted(matchId, 'MATCH_STARTED');
    return this.emitAndGet(matchId);
  }

  // ---------- roster / lineup ----------
  static async replaceRoster(matchId: string, sideParam: string, entries: MatchRosterEntryInput[]) {
    const side = normalizeSideParam(sideParam);
    if (!Array.isArray(entries)) throw new AppError('players array is required', 400);
    if (entries.length < 6 || entries.length > 16) throw new AppError('Roster must have 6-16 players', 400);
    const jerseys = entries.map(e => e.jerseyNumber);
    if (new Set(jerseys).size !== jerseys.length) throw new AppError('Jersey numbers must be unique per team', 400);
    for (const j of jerseys) if (!Number.isInteger(j) || j < 1 || j > 99) throw new AppError('Jersey numbers must be 1-99', 400);
    const captains = entries.filter(e => e.isCaptain).length;
    const liberos = entries.filter(e => e.isLibero).length;
    if (captains > 1) throw new AppError('Max 1 captain per team', 400);
    if (liberos > 2) throw new AppError('Max 2 liberos per roster', 400);

    await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId } });
      if (!match) throw new AppError('Match not found', 404);
      const teamId = side === 'HOME' ? match.homeTeamId : match.awayTeamId;
      if (!teamId) throw new AppError('Team must be assigned to match before setting roster', 400);

      // resolve/create players
      const resolved: Array<{ playerId: string; jerseyNumber: number; isCaptain: boolean; isLibero: boolean }> = [];
      for (const e of entries) {
        let playerId = e.playerId;
        if (playerId) {
          const p = await tx.player.findUnique({ where: { id: playerId } });
          if (!p) throw new AppError(`Player not found: ${playerId}`, 400);
          // ensure attached to team
          if (p.teamId !== teamId) await tx.player.update({ where: { id: playerId }, data: { teamId } });
          if (e.jerseyNumber != null) await tx.player.update({ where: { id: playerId }, data: { jerseyNumber: e.jerseyNumber } }).catch(()=>{});
        } else {
          const name = String(e.name || '').trim();
          if (!name) throw new AppError('name is required for quick-add players without playerId', 400);
          const parts = name.split(/\s+/);
          const firstName = parts[0] || 'Player';
          const lastName = parts.slice(1).join(' ') || 'Name';
          const created = await tx.player.create({ data: { teamId, firstName, lastName, displayName: name, jerseyNumber: e.jerseyNumber, position: e.position || null, isCaptain: !!e.isCaptain, isLibero: !!e.isLibero } });
          playerId = created.id;
        }
        // keep team-level captain/libero flags in sync best-effort
        await tx.player.update({ where: { id: playerId! }, data: { jerseyNumber: e.jerseyNumber, position: e.position ?? undefined, isCaptain: !!e.isCaptain, isLibero: !!e.isLibero, teamId } });
        resolved.push({ playerId: playerId!, jerseyNumber: e.jerseyNumber, isCaptain: !!e.isCaptain, isLibero: !!e.isLibero });
      }

      await tx.matchRoster.deleteMany({ where: { matchId, side } });
      for (const r of resolved) {
        await tx.matchRoster.create({ data: { matchId, teamId, playerId: r.playerId, side, jerseyNumber: r.jerseyNumber, isCaptain: r.isCaptain, isLibero: r.isLibero, isActive: true } });
      }
      // remove lineups that reference players no longer on roster for this side
      const validIds = new Set(resolved.map(r => r.playerId));
      await tx.startingLineup.deleteMany({ where: { matchId, side, playerId: { notIn: Array.from(validIds) } } });
      await this.bumpRevision(tx, matchId);
    });
    invalidateMatchState(matchId);
    return this.getMatchState(matchId, { force: true });
  }

  static async getRoster(matchId: string, sideParam: string) {
    const side = normalizeSideParam(sideParam);
    const roster = await prisma.matchRoster.findMany({ where: { matchId, side }, include: { player: true }, orderBy: [{ jerseyNumber: 'asc' }] });
    return roster.map(r => ({
      playerId: r.playerId,
      jerseyNumber: r.jerseyNumber,
      name: r.player?.displayName || `${r.player?.firstName || ''} ${r.player?.lastName || ''}`.trim(),
      position: r.player?.position || null,
      isCaptain: r.isCaptain,
      isLibero: r.isLibero,
      isActive: r.isActive,
    }));
  }

  static async copyRosterFrom(matchId: string, sideParam: string, otherMatchId: string) {
    const side = normalizeSideParam(sideParam);
    const source = await prisma.matchRoster.findMany({ where: { matchId: otherMatchId, side }, include: { player: true } });
    if (!source.length) throw new AppError('No roster found to copy', 400);
    const entries: MatchRosterEntryInput[] = source.map(r => ({ playerId: r.playerId, jerseyNumber: r.jerseyNumber, name: r.player?.displayName || `${r.player?.firstName || ''} ${r.player?.lastName || ''}`.trim(), position: r.player?.position || null, isCaptain: r.isCaptain, isLibero: r.isLibero }));
    return this.replaceRoster(matchId, side, entries);
  }

  static async setLineup(matchId: string, sideParam: string, setNumber: number, input: { players: Array<{ rotationPos: number; playerId?: string; jerseyNumber?: number }>; liberoId?: string | null }) {
    const side = normalizeSideParam(sideParam);
    const sn = Number(setNumber);
    if (!Number.isInteger(sn) || sn < 1 || sn > 7) throw new AppError('Invalid set number', 400);
    const players = input?.players || [];
    if (players.length !== 6) throw new AppError('Lineup must include exactly 6 players', 400);
    const pos = players.map(p => p.rotationPos);
    if (new Set(pos).size !== 6 || pos.some(p => p < 1 || p > 6)) throw new AppError('rotation positions must be unique 1-6', 400);

    await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId } });
      if (!match) throw new AppError('Match not found', 404);
      const roster = await tx.matchRoster.findMany({ where: { matchId, side } });
      if (roster.length < 6) throw new AppError('Roster must have at least 6 players', 400);
      const rosterById = new Map(roster.map(r => [r.playerId, r]));
      const rosterByJersey = new Map(roster.map(r => [r.jerseyNumber, r]));

      const resolved = players.map(p => {
        const r = p.playerId ? rosterById.get(p.playerId) : (p.jerseyNumber != null ? rosterByJersey.get(p.jerseyNumber) : undefined);
        if (!r) throw new AppError(`Lineup player not found in roster (pos ${p.rotationPos})`, 400);
        return { rotationPos: p.rotationPos, playerId: r.playerId, isLibero: r.isLibero };
      });
      const ids = resolved.map(r => r.playerId);
      if (new Set(ids).size !== 6) throw new AppError('Lineup players must be unique', 400);
      const liberosInLineup = resolved.filter(r => r.isLibero).length;
      if (liberosInLineup > 1) throw new AppError('At most 1 libero per lineup', 400);

      await tx.startingLineup.deleteMany({ where: { matchId, side, setNumber: sn } });
      const teamId = side === 'HOME' ? match.homeTeamId : match.awayTeamId;
      for (const r of resolved.sort((a,b)=>a.rotationPos-b.rotationPos)) {
        await tx.startingLineup.create({ data: { matchId, setNumber: sn, side, teamId: teamId || null, playerId: r.playerId, rotationPos: r.rotationPos } });
      }
      await this.bumpRevision(tx, matchId);
    });
    invalidateMatchState(matchId);
    return this.getMatchState(matchId, { force: true });
  }

  static async ensureDefaultLineupForSet(tx: Tx, matchId: string, side: Side, setNumber: number) {
    if (setNumber <= 1) return;
    const existing = await tx.startingLineup.findMany({ where: { matchId, side, setNumber } });
    if (existing.length) return;
    const prev = await tx.startingLineup.findMany({ where: { matchId, side, setNumber: setNumber - 1 } });
    if (!prev.length) return;
    const roster = await tx.matchRoster.findMany({ where: { matchId, side } });
    const valid = new Set(roster.map((r: any) => r.playerId));
    const copy = prev.filter((p: any) => valid.has(p.playerId));
    if (copy.length !== 6) return;
    const match = await tx.match.findUnique({ where: { id: matchId } });
    const teamId = side === 'HOME' ? match?.homeTeamId : match?.awayTeamId;
    for (const p of copy) {
      await tx.startingLineup.create({ data: { matchId, setNumber, side, teamId: teamId || null, playerId: p.playerId, rotationPos: p.rotationPos } });
    }
  }

  // ---------- mutations with idempotency ----------
  static async changeScore(matchId: string, team: TeamId, delta: 1 | -1 = 1, opts?: { clientEventId?: string; actorUserId?: string }): Promise<MatchState> {
    const outcome = await prisma.$transaction(async (tx) => {
      if (await this.ensureIdempotent(tx, matchId, opts?.clientEventId)) return { idempotent: true as const };
      const match = await this.requireMatch(tx, matchId);
      let result: any;
      let correctionAsUndo = false;
      if (delta > 0) {
        result = await this.applyPoint(tx, match, team, 'MANUAL', undefined, opts);
      } else {
        const side = sideFromTeam(team);
        const last = await tx.matchEvent.findFirst({ where: { matchId, isReversal: false, type: { notIn: ['UNDO','NOTE'] as any } }, orderBy: { sequenceNumber: 'desc' } });
        const lastScoringTeam = (() => {
          if (!last) return null;
          if (last.type === 'POINT_AWARDED') return last.teamSide as Side | null;
          if (last.type === 'ACTION_RECORDED') {
            const action = String((last.payload as any)?.action || '').toUpperCase();
            if (['KILL','ACE','BLOCK','POINT'].includes(action)) return last.teamSide as Side | null;
            if (action === 'ATTACK_ERROR') return last.teamSide ? otherSide(last.teamSide as Side) : null;
          }
          return null;
        })();
        if (last && lastScoringTeam === side) {
          await this.reverseEvent(tx, matchId, last, opts);
          const undoEvt = await this.createEvent(tx, matchId, { type: 'UNDO', payload: { targetEventId: last.id, targetType: last.type, reason: 'MANUAL_MINUS_ONE' }, actorUserId: opts?.actorUserId || null, clientEventId: opts?.clientEventId || null, correctsEventId: last.id, isReversal: true });
          correctionAsUndo = true;
          const updatedMatch = await tx.match.findUnique({ where: { id: matchId }, include: { sets: true } });
          const set = updatedMatch?.sets.find((s: any) => s.setNumber === updatedMatch.currentSetNumber);
          result = { set, setNumber: set?.setNumber, setCompleted: false, matchCompleted: false, pendingEnd: !!(set as any)?.pendingEnd, event: undoEvt, winnerSide: undefined, setsWonHome: updatedMatch?.setsWonHome ?? 0, setsWonAway: updatedMatch?.setsWonAway ?? 0, nextSetNumber: undefined };
        } else {
          result = await this.applyCorrectionPoint(tx, match, team, opts);
        }
      }
      const revision = await this.bumpRevision(tx, matchId);
      return { idempotent: false as const, match, result, revision, correctionAsUndo };
    });
    if (outcome.idempotent) return this.getMatchState(matchId);
    const { match, result, revision, correctionAsUndo } = outcome;

    if (correctionAsUndo || delta < 0) {
      await onMatchEventCommitted(matchId, 'UNDO');
      return this.emitAndGet(matchId);
    }
    // Fast path: patch the cached state and emit a compact delta so the point
    // is visible immediately. The authoritative rebuild (stats, events,
    // lineups, flags) follows on a short debounce.
    const sets = this.applyResultToSets(match, result);
    const status: MatchStatus = result?.matchCompleted
      ? 'COMPLETED'
      : result?.setCompleted
        ? 'BETWEEN_SETS'
        : 'LIVE';
    const patch = this.buildScorePatch({
      match,
      sets,
      revision,
      status,
      currentSetNumber: result?.setCompleted && !result?.matchCompleted ? result.nextSetNumber : match.currentSetNumber,
      servingSide: ((result?.winnerSide || sideFromTeam(team)) as Side),
      setsWonHome: result?.setsWonHome ?? match.setsWonHome ?? 0,
      setsWonAway: result?.setsWonAway ?? match.setsWonAway ?? 0,
      winnerSide: result?.matchCompleted ? result.winnerSide : null,
      lastEvent: result?.event ? this.mapEvent(result.event) : null,
    });
    const state = this.emitScorePatchAndGet(patch, match.court);
    if (result?.matchCompleted && (match as any).competitionId) invalidateStandingsCache((match as any).competitionId);
    this.queueSideEffect(matchId, result?.matchCompleted ? 'MATCH_COMPLETED' : result?.setCompleted ? 'SET_COMPLETED' : 'POINT_AWARDED');
    return state ?? this.getMatchState(matchId, { force: true });
  }

  static async recordAction(matchId: string, team: TeamId, action: string, opts?: { clientEventId?: string; actorUserId?: string; playerId?: string; assistPlayerId?: string }): Promise<MatchState> {
    const actionUpper = action.toUpperCase();
    const statKey = ACTION_STAT_MAP[actionUpper];
    const outcome = await prisma.$transaction(async (tx) => {
      if (await this.ensureIdempotent(tx, matchId, opts?.clientEventId)) return { idempotent: true as const };
      const match = await this.requireMatch(tx, matchId);
      if (match.status === 'COMPLETED' || match.status === 'CANCELLED') throw new AppError('Match is not active', 400);
      if (['SCHEDULED','READY','BETWEEN_SETS','PAUSED','SUSPENDED'].includes(match.status)) {
        await tx.match.update({ where: { id: matchId }, data: { status: 'LIVE', startedAt: match.startedAt || new Date() } });
        match.status = 'LIVE';
      }
      const side = sideFromTeam(team);
      const recorded = await this.createEvent(tx, matchId, { type: 'ACTION_RECORDED', teamSide: side, payload: { action: actionUpper, playerId: opts?.playerId || null, assistPlayerId: opts?.assistPlayerId || null }, actorUserId: opts?.actorUserId || null, clientEventId: opts?.clientEventId || null });
      if (statKey) await this.applyTeamPlayerStat(tx, matchId, side, statKey, 1, opts?.playerId);
      if (opts?.assistPlayerId && actionUpper === 'KILL') await this.applyTeamPlayerStat(tx, matchId, side, 'assist', 1, opts.assistPlayerId);
      let result: any = null;
      let scoringTeam: TeamId | null = null;
      if (SCORING_ACTIONS.includes(actionUpper as any)) {
        scoringTeam = team;
        result = await this.applyPoint(tx, match, team, actionUpper, opts?.playerId, { ...opts, clientEventId: undefined });
      }
      if (actionUpper === 'ATTACK_ERROR') {
        scoringTeam = otherTeam(team);
        result = await this.applyPoint(tx, match, scoringTeam, actionUpper, undefined, { ...opts, clientEventId: undefined });
      }
      const revision = await this.bumpRevision(tx, matchId);
      return { idempotent: false as const, match, result, revision, recorded, scoringTeam };
    });
    if (outcome.idempotent) return this.getMatchState(matchId);
    const { match, result, revision, recorded, scoringTeam } = outcome;

    const sets = this.applyResultToSets(match, result);
    const status: MatchStatus = result?.matchCompleted ? 'COMPLETED' : result?.setCompleted ? 'BETWEEN_SETS' : 'LIVE';
    const patch = this.buildScorePatch({
      match,
      sets,
      revision,
      status,
      currentSetNumber: result?.setCompleted && !result?.matchCompleted ? result.nextSetNumber : match.currentSetNumber,
      servingSide: (result?.winnerSide || (scoringTeam ? sideFromTeam(scoringTeam) : (match.servingSide as Side))) as Side,
      setsWonHome: result?.setsWonHome ?? match.setsWonHome ?? 0,
      setsWonAway: result?.setsWonAway ?? match.setsWonAway ?? 0,
      winnerSide: result?.matchCompleted ? result.winnerSide : null,
      lastEvent: this.mapEvent(result?.event || recorded),
    });
    const state = this.emitScorePatchAndGet(patch, match.court);
    if (result?.matchCompleted && (match as any).competitionId) invalidateStandingsCache((match as any).competitionId);
    this.queueSideEffect(matchId, result?.matchCompleted ? 'MATCH_COMPLETED' : result?.setCompleted ? 'SET_COMPLETED' : 'ACTION_RECORDED');
    return state ?? this.getMatchState(matchId, { force: true });
  }

  static async callTimeout(matchId: string, team: TeamId, opts?: { clientEventId?: string; actorUserId?: string }): Promise<MatchState> {
    const idem = await prisma.$transaction(async (tx) => {
      if (await this.ensureIdempotent(tx, matchId, opts?.clientEventId)) return true;
      const match = await this.requireMatch(tx, matchId);
      if (['SCHEDULED','READY'].includes(match.status)) throw new AppError('Match not live', 400);
      if (match.status === 'COMPLETED' || match.status === 'CANCELLED') throw new AppError('Match has finished', 400);
      const side = sideFromTeam(team);
      const used = await tx.timeout.count({ where: { matchId, side, setNumber: match.currentSetNumber } });
      if (used >= (match.timeoutsPerSet || 2)) throw new AppError('No timeouts remaining for this set.', 400);
      await tx.timeout.create({ data: { matchId, side, setNumber: match.currentSetNumber, timeoutNumber: used + 1 } });
      await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId, side } }, data: { timeoutsUsed: { increment: 1 } } });
      await this.createEvent(tx, matchId, { type: 'TIMEOUT_CALLED', teamSide: side, payload: { team }, actorUserId: opts?.actorUserId || null, clientEventId: opts?.clientEventId || null });
      await this.bumpRevision(tx, matchId);
      return false;
    });
    if (idem) return this.getMatchState(matchId);
    await onMatchEventCommitted(matchId, 'TIMEOUT_CALLED');
    return this.emitAndGet(matchId);
  }

  static async recordSubstitution(matchId: string, body: { team: TeamId; out?: string; in?: string; playerOutId?: string; playerInId?: string }, opts?: { clientEventId?: string; actorUserId?: string }): Promise<MatchState> {
    const idem = await prisma.$transaction(async (tx) => {
      if (await this.ensureIdempotent(tx, matchId, opts?.clientEventId)) return true;
      const match = await this.requireMatch(tx, matchId);
      if (['SCHEDULED','READY'].includes(match.status)) throw new AppError('Match not live', 400);
      if (match.status === 'COMPLETED' || match.status === 'CANCELLED') throw new AppError('Match has finished', 400);
      const side = sideFromTeam(body.team);
      const used = await tx.substitution.count({ where: { matchId, side, setNumber: match.currentSetNumber } });
      if (used >= (match.substitutionsPerSet || 6)) throw new AppError('No substitutions remaining for this set.', 400);
      await tx.substitution.create({ data: {
        matchId, side, setNumber: match.currentSetNumber, substitutionNo: used + 1,
        playerOutId: body.playerOutId || null, playerInId: body.playerInId || null,
        playerOutJersey: body.out ? Number(body.out) || null : null,
        playerInJersey: body.in ? Number(body.in) || null : null,
      }});
      await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId, side } }, data: { substitutionsUsed: { increment: 1 } } });
      await this.createEvent(tx, matchId, { type: 'SUBSTITUTION_RECORDED', teamSide: side, payload: { out: body.out || null, in: body.in || null, playerOutId: body.playerOutId || null, playerInId: body.playerInId || null }, actorUserId: opts?.actorUserId || null, clientEventId: opts?.clientEventId || null });
      await this.bumpRevision(tx, matchId);
      return false;
    });
    if (idem) return this.getMatchState(matchId);
    await onMatchEventCommitted(matchId, 'SUBSTITUTION_RECORDED');
    return this.emitAndGet(matchId);
  }

  static async undoLastEvent(matchId: string, opts?: { clientEventId?: string; actorUserId?: string }): Promise<MatchState> {
    const idem = await prisma.$transaction(async (tx) => {
      if (await this.ensureIdempotent(tx, matchId, opts?.clientEventId)) return true;
      const last = await tx.matchEvent.findFirst({ where: { matchId, isReversal: false, type: { notIn: ['UNDO','NOTE'] as any } }, orderBy: { sequenceNumber: 'desc' } });
      if (!last) throw new AppError('Nothing to undo', 400);
      await this.reverseEvent(tx, matchId, last, opts);
      await this.createEvent(tx, matchId, { type: 'UNDO', payload: { targetEventId: last.id, targetType: last.type }, actorUserId: opts?.actorUserId || null, clientEventId: opts?.clientEventId || null, correctsEventId: last.id, isReversal: true });
      await this.bumpRevision(tx, matchId);
      return false;
    });
    if (idem) return this.getMatchState(matchId);
    await onMatchEventCommitted(matchId, 'UNDO');
    return this.emitAndGet(matchId);
  }

  static async attributeEvent(matchId: string, eventId: string, body: { playerId?: string | null; assistPlayerId?: string | null }, actorUserId?: string): Promise<MatchState> {
    await prisma.$transaction(async (tx) => {
      const ev = await tx.matchEvent.findFirst({ where: { id: eventId, matchId } });
      if (!ev) throw new AppError('Event not found', 404);
      if (ev.isReversal) throw new AppError('Cannot attribute a reversal event', 400);
      const payload = { ...(ev.payload as any || {}) };
      const oldPlayerId = payload.playerId || null;
      const oldAssist = payload.assistPlayerId || null;
      const newPlayerId = body.playerId === undefined ? oldPlayerId : (body.playerId || null);
      const newAssist = body.assistPlayerId === undefined ? oldAssist : (body.assistPlayerId || null);
      const side = ev.teamSide as Side | null;
      if (!side) throw new AppError('Event has no team side', 400);
      const action = String(payload.action || '').toUpperCase();

      const applyDelta = async (playerId: string | null, field: string, delta: number) => {
        if (!playerId || !field || !delta) return;
        await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId, side } }, data: { [field]: { increment: delta } } as any }).catch(() => {});
        await this.ensurePlayerStats(tx, matchId, playerId, side);
        await tx.playerMatchStatistics.update({ where: { matchId_playerId: { matchId, playerId } }, data: { [field]: { increment: delta } } as any }).catch(() => {});
      };

      if (ev.type === 'ACTION_RECORDED') {
        const statKey = ACTION_STAT_MAP[action];
        const fieldMap: Record<string,string> = { kill:'kills', error:'errors', ace:'aces', block:'blocks', dig:'digs', assist:'assists' };
        const dbField = statKey ? (fieldMap[statKey] || statKey) : null;
        if (dbField && oldPlayerId !== newPlayerId) {
          await applyDelta(oldPlayerId, dbField, -1);
          await applyDelta(newPlayerId, dbField, 1);
        }
        if (action === 'KILL' && oldAssist !== newAssist) {
          await applyDelta(oldAssist, 'assists', -1);
          await applyDelta(newAssist, 'assists', 1);
        }
        const impliedScoring = SCORING_ACTIONS.includes(action as any) || action === 'ATTACK_ERROR';
        if (impliedScoring) {
          const pointSide = action === 'ATTACK_ERROR' ? otherSide(side) : side;
          const pointEvent = await tx.matchEvent.findFirst({
            where: { matchId, type: 'POINT_AWARDED', teamSide: pointSide, sequenceNumber: { gte: ev.sequenceNumber } },
            orderBy: { sequenceNumber: 'asc' },
          });
          if (pointEvent) {
            const pp = { ...(pointEvent.payload as any || {}) };
            const oldP = pp.playerId || null;
            if (oldP !== newPlayerId && action !== 'ATTACK_ERROR') {
              if (oldP) await tx.playerMatchStatistics.updateMany({ where: { matchId, playerId: oldP }, data: { points: { decrement: 1 } } as any }).catch(() => {});
              if (newPlayerId) { await this.ensurePlayerStats(tx, matchId, newPlayerId, pointSide); await tx.playerMatchStatistics.updateMany({ where: { matchId, playerId: newPlayerId }, data: { points: { increment: 1 } } as any }).catch(() => {}); }
              pp.playerId = newPlayerId;
              await tx.matchEvent.update({ where: { id: pointEvent.id }, data: { payload: pp as any } });
            }
          }
        }
        payload.playerId = newPlayerId;
        payload.assistPlayerId = newAssist;
        await tx.matchEvent.update({ where: { id: ev.id }, data: { payload: payload as any } });
      } else if (ev.type === 'POINT_AWARDED') {
        if (oldPlayerId !== newPlayerId) {
          if (oldPlayerId) await tx.playerMatchStatistics.updateMany({ where: { matchId, playerId: oldPlayerId }, data: { points: { decrement: 1 } } as any }).catch(() => {});
          if (newPlayerId) { await this.ensurePlayerStats(tx, matchId, newPlayerId, side); await tx.playerMatchStatistics.updateMany({ where: { matchId, playerId: newPlayerId }, data: { points: { increment: 1 } } as any }).catch(() => {}); }
          payload.playerId = newPlayerId;
          await tx.matchEvent.update({ where: { id: ev.id }, data: { payload: payload as any } });
        }
      } else {
        throw new AppError('Only action/point events can be attributed', 400);
      }

      await this.createEvent(tx, matchId, { type: 'NOTE', teamSide: side, payload: { kind: 'ATTRIBUTION', eventId, playerId: newPlayerId, assistPlayerId: newAssist }, actorUserId: actorUserId || null });
      await this.bumpRevision(tx, matchId);
    });
    await onMatchEventCommitted(matchId, 'ATTRIBUTION');
    return this.emitAndGet(matchId);
  }

  // ---------- core mutation internals ----------
  private static async requireMatch(tx: Tx, matchId: string) {
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { sets: true } });
    if (!match) throw new AppError('Match not found', 404);
    return match;
  }

  private static async ensurePlayerStats(tx: Tx, matchId: string, playerId: string, side: Side) {
    const existing = await tx.playerMatchStatistics.findUnique({ where: { matchId_playerId: { matchId, playerId } } });
    if (!existing) await tx.playerMatchStatistics.create({ data: { matchId, playerId, side } });
  }

  private static async applyPoint(tx: Tx, match: any, scoringTeam: TeamId, cause: string, playerId?: string, opts?: any) {
    if (['SCHEDULED','READY'].includes(match.status)) throw new AppError('Match must be LIVE to score points', 400);
    if (match.status === 'COMPLETED' || match.status === 'CANCELLED') throw new AppError('This match has finished.', 400);
    const scoringSide = sideFromTeam(scoringTeam);
    const set = match.sets.find((s: any) => s.setNumber === match.currentSetNumber);
    if (!set) throw new AppError('Current set not found', 500);
    if (set.status === 'COMPLETED') throw new AppError('Current set is completed', 400);
    if ((set as any).pendingEnd) throw new AppError('Set is pending end. End the set or undo the last point.', 400);
    if (match.status === 'BETWEEN_SETS') {
      await tx.match.update({ where: { id: match.id }, data: { status: 'LIVE' } });
      await tx.matchSet.update({ where: { id: set.id }, data: { status: 'LIVE' } });
      match.status = 'LIVE';
    } else if (['PAUSED','SUSPENDED'].includes(match.status)) {
      await tx.match.update({ where: { id: match.id }, data: { status: 'LIVE', startedAt: match.startedAt || new Date() } });
      await tx.matchSet.updateMany({ where: { matchId: match.id, setNumber: match.currentSetNumber }, data: { status: 'LIVE' } });
      match.status = 'LIVE';
    }

    const prevServer = (set.servingSide || match.servingSide || 'HOME') as Side;
    if (scoringSide !== prevServer) {
      await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId: match.id, side: scoringSide } }, data: { sideoutAttempts: { increment: 1 }, sideoutWins: { increment: 1 }, rotations: { increment: 1 } } });
    } else {
      await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId: match.id, side: otherSide(scoringSide) } }, data: { sideoutAttempts: { increment: 1 } } });
    }

    const pointField = scoringSide === 'HOME' ? 'homePoints' : 'awayPoints';
    const updatedSet = await tx.matchSet.update({ where: { id: set.id }, data: { [pointField]: { increment: 1 }, servingSide: scoringSide, status: 'LIVE' } as any });
    await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId: match.id, side: scoringSide } }, data: { points: { increment: 1 } } });
    if (playerId) { await this.ensurePlayerStats(tx, match.id, playerId, scoringSide); await tx.playerMatchStatistics.update({ where: { matchId_playerId: { matchId: match.id, playerId } }, data: { points: { increment: 1 } } }); }
    await tx.match.update({ where: { id: match.id }, data: { servingSide: scoringSide, status: 'LIVE' } });
    const pointEvent = await this.createEvent(tx, match.id, { setId: set.id, type: 'POINT_AWARDED', teamSide: scoringSide, actorUserId: opts?.actorUserId || null, clientEventId: opts?.clientEventId || null, payload: { cause, team: scoringTeam, playerId: playerId || null, homePoints: updatedSet.homePoints, awayPoints: updatedSet.awayPoints } });

    const winner = this.isSetWon(updatedSet.homePoints, updatedSet.awayPoints, updatedSet.targetPoints, updatedSet.minDifference);
    if (winner && (match as any).confirmSetEnd !== false) {
      await this.safeUpdate(tx, 'matchSet', { where: { id: set.id }, data: { pendingEnd: true } as any });
      (updatedSet as any).pendingEnd = true;
      return { set: updatedSet, setNumber: updatedSet.setNumber, setCompleted: false, matchCompleted: false, pendingEnd: true, event: pointEvent, winnerSide: winner, setsWonHome: match.setsWonHome, setsWonAway: match.setsWonAway, nextSetNumber: undefined };
    }
    const completion = winner
      ? await this.completeSet(tx, match, updatedSet, winner)
      : { setCompleted: false, matchCompleted: false, setsWonHome: match.setsWonHome, setsWonAway: match.setsWonAway, nextSetNumber: undefined };
    return { set: updatedSet, setNumber: updatedSet.setNumber, pendingEnd: false, event: pointEvent, winnerSide: winner, ...completion };
  }

  private static isSetWon(home: number, away: number, target: number, minDiff: number): Side | null {
    if ((home >= target || away >= target) && Math.abs(home - away) >= minDiff) return home > away ? 'HOME' : 'AWAY';
    return null;
  }

  private static async completeSet(tx: Tx, match: any, set: any, winnerSide: Side): Promise<{ setCompleted: boolean; matchCompleted: boolean; setsWonHome: number; setsWonAway: number; nextSetNumber?: number }> {
    await this.safeUpdate(tx, 'matchSet', { where: { id: set.id }, data: { status: 'COMPLETED', winnerSide, pendingEnd: false } as any });
    const setsWonHome = winnerSide === 'HOME' ? match.setsWonHome + 1 : match.setsWonHome;
    const setsWonAway = winnerSide === 'AWAY' ? match.setsWonAway + 1 : match.setsWonAway;
    await this.createEvent(tx, match.id, { setId: set.id, type: 'SET_COMPLETED', teamSide: winnerSide, payload: { setNumber: set.setNumber } });
    if (setsWonHome >= match.setsToWin || setsWonAway >= match.setsToWin) {
      await tx.match.update({ where: { id: match.id }, data: { status: 'COMPLETED', winnerSide, setsWonHome, setsWonAway, endedAt: new Date() } });
      await this.createEvent(tx, match.id, { setId: set.id, type: 'MATCH_COMPLETED', teamSide: winnerSide, payload: { setsWonHome, setsWonAway } });
      return { setCompleted: true, matchCompleted: true, setsWonHome, setsWonAway };
    }
    const nextSetNumber = set.setNumber + 1;
    await this.ensureDefaultLineupForSet(tx, match.id, 'HOME', nextSetNumber);
    await this.ensureDefaultLineupForSet(tx, match.id, 'AWAY', nextSetNumber);
    await tx.match.update({ where: { id: match.id }, data: { status: 'BETWEEN_SETS', currentSetNumber: nextSetNumber, setsWonHome, setsWonAway, servingSide: winnerSide } });
    await tx.matchSet.updateMany({ where: { matchId: match.id, setNumber: nextSetNumber }, data: { status: 'READY', servingSide: winnerSide } });
    await this.createEvent(tx, match.id, { type: 'MATCH_STATUS_CHANGED', payload: { status: 'BETWEEN_SETS', nextSetNumber } });
    return { setCompleted: true, matchCompleted: false, setsWonHome, setsWonAway, nextSetNumber };
  }

  private static async applyCorrectionPoint(tx: Tx, match: any, team: TeamId, opts?: any) {
    const side = sideFromTeam(team);
    const set = match.sets.find((s: any) => s.setNumber === match.currentSetNumber);
    if (!set) throw new AppError('Current set not found', 500);
    const points = side === 'HOME' ? set.homePoints : set.awayPoints;
    if (points <= 0) throw new AppError('No points to remove.', 400);
    if (set.status === 'COMPLETED' || match.status === 'COMPLETED' || (set as any).pendingEnd) {
      throw new AppError('Set is complete or pending end. Use Undo end of set instead.', 400);
    }
    const updatedSet = await tx.matchSet.update({ where: { id: set.id }, data: side === 'HOME' ? { homePoints: { decrement: 1 } } : { awayPoints: { decrement: 1 } } });
    await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId: match.id, side } }, data: { points: { decrement: 1 } } });
    const event = await this.createEvent(tx, match.id, { setId: set.id, type: 'CORRECTION', teamSide: side, actorUserId: opts?.actorUserId || null, clientEventId: opts?.clientEventId || null, payload: { delta: -1, team, kind: 'MANUAL_SCORE_CORRECTION' } });
    return { set: updatedSet, setNumber: set.setNumber, setCompleted: false, matchCompleted: false, pendingEnd: !!(updatedSet as any).pendingEnd, event, winnerSide: undefined, setsWonHome: match.setsWonHome, setsWonAway: match.setsWonAway, nextSetNumber: undefined };
  }

  private static async reverseEvent(tx: Tx, matchId: string, ev: any, _opts?: any) {
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { sets: true } });
    if (!match) throw new AppError('Match not found', 404);
    const payload = (ev.payload || {}) as any;
    const side = ev.teamSide as Side | null;

    if (ev.type === 'POINT_AWARDED' && side) {
      const setNumber = payload.setNumber || match.currentSetNumber;
      const set = match.sets.find((s: any) => s.setNumber === setNumber) || match.sets.find((s: any) => s.setNumber === match.currentSetNumber);
      if (!set) throw new AppError('Set not found for undo', 400);
      if (match.status === 'COMPLETED' || set.status === 'COMPLETED') throw new AppError('Undo of points after set/match completion requires extended correction workflow.', 400);
      const cur = side === 'HOME' ? set.homePoints : set.awayPoints;
      if (cur <= 0) throw new AppError('Cannot undo point.', 400);
      const setUpdate: any = side === 'HOME' ? { homePoints: { decrement: 1 } } : { awayPoints: { decrement: 1 } };
      if ((set as any).pendingEnd) setUpdate.pendingEnd = false;
      await tx.matchSet.update({ where: { id: set.id }, data: setUpdate });
      await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId, side } }, data: { points: { decrement: 1 } } });
      if (payload.playerId) await tx.playerMatchStatistics.updateMany({ where: { matchId, playerId: payload.playerId }, data: { points: { decrement: 1 } } as any });
      return;
    }

    if (ev.type === 'ACTION_RECORDED' && side) {
      const action = String(payload.action || '').toUpperCase();
      const fieldMap: Record<string,string> = { kill:'kills', error:'errors', ace:'aces', block:'blocks', dig:'digs', assist:'assists' };
      const statKey = ACTION_STAT_MAP[action];
      const dbField = statKey ? (fieldMap[statKey] || statKey) : null;
      if (dbField) {
        await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId, side } }, data: { [dbField]: { decrement: 1 } } as any }).catch(()=>{});
        if (payload.playerId) await tx.playerMatchStatistics.updateMany({ where: { matchId, playerId: payload.playerId }, data: { [dbField]: { decrement: 1 } } as any }).catch(()=>{});
      }
      if (payload.assistPlayerId && action === 'KILL') {
        await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId, side } }, data: { assists: { decrement: 1 } } as any }).catch(()=>{});
        await tx.playerMatchStatistics.updateMany({ where: { matchId, playerId: payload.assistPlayerId }, data: { assists: { decrement: 1 } } as any }).catch(()=>{});
      }
      const impliedScoring = SCORING_ACTIONS.includes(action as any) || action === 'ATTACK_ERROR';
      if (impliedScoring) {
        const pointSide = action === 'ATTACK_ERROR' ? otherSide(side) : side;
        const lastPoint = await tx.matchEvent.findFirst({ where: { matchId, type: 'POINT_AWARDED', teamSide: pointSide }, orderBy: { sequenceNumber: 'desc' } });
        if (lastPoint) await this.reverseEvent(tx, matchId, lastPoint, _opts);
      }
      return;
    }

    if (ev.type === 'TIMEOUT_CALLED' && side) {
      const t = await tx.timeout.findFirst({ where: { matchId, eventId: ev.id } });
      if (t) await tx.timeout.delete({ where: { id: t.id } }).catch(()=>{});
      else {
        const last = await tx.timeout.findFirst({ where: { matchId, side, setNumber: match.currentSetNumber }, orderBy: { timeoutNumber: 'desc' } });
        if (last) await tx.timeout.delete({ where: { id: last.id } }).catch(()=>{});
      }
      await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId, side } }, data: { timeoutsUsed: { decrement: 1 } } }).catch(()=>{});
      return;
    }

    if (ev.type === 'SUBSTITUTION_RECORDED' && side) {
      const sub = await tx.substitution.findFirst({ where: { matchId, eventId: ev.id } });
      if (sub) await tx.substitution.delete({ where: { id: sub.id } }).catch(()=>{});
      else {
        const last = await tx.substitution.findFirst({ where: { matchId, side, setNumber: match.currentSetNumber }, orderBy: { substitutionNo: 'desc' } });
        if (last) await tx.substitution.delete({ where: { id: last.id } }).catch(()=>{});
      }
      await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId, side } }, data: { substitutionsUsed: { decrement: 1 } } }).catch(()=>{});
      return;
    }

    if (ev.type === 'CORRECTION') {
      const delta = Number(payload.delta || 0);
      if (delta === -1 && side) {
        const set = match.sets.find((s: any) => s.setNumber === match.currentSetNumber);
        if (set && set.status !== 'COMPLETED') {
          await tx.matchSet.update({ where: { id: set.id }, data: side === 'HOME' ? { homePoints: { increment: 1 } } : { awayPoints: { increment: 1 } } });
          await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId, side } }, data: { points: { increment: 1 } } }).catch(()=>{});
        }
      }
      return;
    }

    throw new AppError(`Undo for event type ${ev.type} is not fully supported in this state.`, 400);
  }

  static async endSet(matchId: string, opts?: { force?: boolean; reason?: string }): Promise<MatchState> {
    const outcome = await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId }, include: { sets: true } });
      if (!match) throw new AppError('Match not found', 404);
      const set = match.sets.find((s: any) => s.setNumber === match.currentSetNumber);
      if (!set) throw new AppError('Current set not found', 500);
      if (set.homePoints === set.awayPoints) throw new AppError('The set cannot end tied.', 400);
      const winner: Side = set.homePoints > set.awayPoints ? 'HOME' : 'AWAY';
      const force = !!opts?.force && !!String(opts?.reason || '').trim();
      if (!force) {
        if (Math.abs(set.homePoints - set.awayPoints) < set.minDifference) throw new AppError('Set cannot end without required point difference.', 400);
        if (set.homePoints < set.targetPoints && set.awayPoints < set.targetPoints) throw new AppError('Set target points not reached.', 400);
      } else {
        await this.createEvent(tx, matchId, { setId: set.id, type: 'NOTE', teamSide: winner, payload: { kind: 'set_end_early', reason: String(opts?.reason || '').trim(), setNumber: set.setNumber } });
      }
      const completion = set.status !== 'COMPLETED' ? await this.completeSet(tx, match, set, winner) : { setCompleted: true, matchCompleted: false };
      await this.bumpRevision(tx, matchId);
      return completion;
    });
    await onMatchEventCommitted(matchId, outcome.matchCompleted ? 'MATCH_COMPLETED' : 'SET_COMPLETED');
    return this.emitAndGet(matchId);
  }

  static async startSet(matchId: string, input: StartSetInput = {}): Promise<MatchState> {
    const requestedSet = input.setNumber;
    const servingSide = input.servingSide ? sideFromTeam(input.servingSide) : undefined;

    const pre = await prisma.match.findUnique({ where: { id: matchId }, include: { sets: { orderBy: { setNumber: 'asc' } } } });
    if (!pre) throw new AppError('Match not found', 404);
    if (['COMPLETED','CANCELLED'].includes(pre.status)) throw new AppError('Match cannot start a set from current status', 400);

    const targetSetNumber = requestedSet || pre.currentSetNumber || 1;
    const targetSet = pre.sets.find(s => s.setNumber === targetSetNumber);
    if (!targetSet) throw new AppError(`Set ${targetSetNumber} not found`, 400);
    if (targetSet.status === 'COMPLETED') throw new AppError(`Set ${targetSetNumber} is already completed`, 400);

    if (['SCHEDULED','READY'].includes(pre.status)) {
      await this.goLive(matchId);
    }

    await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId }, include: { sets: { orderBy: { setNumber: 'asc' } } } });
      if (!match) throw new AppError('Match not found', 404);
      if (['COMPLETED','CANCELLED'].includes(match.status)) throw new AppError('Match cannot start a set from current status', 400);
      const set = match.sets.find((s: any) => s.setNumber === targetSetNumber);
      if (!set) throw new AppError(`Set ${targetSetNumber} not found`, 400);
      if (set.status === 'COMPLETED') throw new AppError(`Set ${targetSetNumber} is already completed`, 400);

      const wasLive = match.status === 'LIVE';
      const prevStatus = match.status;
      const nextServing = servingSide || (set.servingSide as Side | null) || (match.servingSide as Side | null) || 'HOME';
      const startedAt = match.startedAt || new Date();

      await tx.match.update({ where: { id: matchId }, data: { status: 'LIVE', currentSetNumber: targetSetNumber, servingSide: nextServing, startedAt } });
      await this.safeUpdate(tx, 'matchSet', { where: { id: set.id }, data: { status: 'LIVE', servingSide: nextServing, pendingEnd: false } as any });

      if (!wasLive && prevStatus !== 'PAUSED' && prevStatus !== 'SUSPENDED') {
        await this.createEvent(tx, matchId, { setId: set.id, type: 'MATCH_STARTED', teamSide: nextServing, payload: { setNumber: targetSetNumber } });
      }
      if (prevStatus !== 'LIVE' || set.status !== 'LIVE') {
        await this.createEvent(tx, matchId, { setId: set.id, type: 'SET_STARTED', teamSide: nextServing, payload: { setNumber: targetSetNumber } });
      }
      await this.bumpRevision(tx, matchId);
    });

    await onMatchEventCommitted(matchId, 'SET_STARTED');
    return this.emitAndGet(matchId);
  }

  static async applySetup(matchId: string, data: MatchSetupInput): Promise<MatchState> {
    await prisma.$transaction(async (tx) => {
      await this.applySetupData(tx, matchId, data);
    });
    return this.emitAndGet(matchId);
  }

  static async updateInfo(matchId: string, data: MatchInfoInput): Promise<MatchState> {
    await prisma.$transaction(async (tx) => {
      const update: any = {};
      if (data.match_no !== undefined) update.matchNumber = clean(data.match_no, '', 20);
      const sched = parseDateTime(data.scheduledAt || data.match_date);
      if (sched) update.scheduledAt = sched;
      else if (data.match_date !== undefined && !data.match_date) update.scheduledAt = null;
      if (Object.keys(update).length) await tx.match.update({ where: { id: matchId }, data: update });
      if (data.referee1 !== undefined || data.referee2 !== undefined) {
        await this.upsertOfficials(tx, matchId, data.referee1, data.referee2);
      }
      await this.bumpRevision(tx, matchId);
    });
    return this.emitAndGet(matchId);
  }

  static async setStatus(matchId: string, status: MatchStatus, reason?: string): Promise<MatchState> {
    if (status === 'LIVE') return this.goLive(matchId);
    let competitionId: string | null = null;
    let prevStatus: string | null = null;
    await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId } });
      if (!match) throw new AppError('Match not found', 404);
      competitionId = (match as any).competitionId || null;
      prevStatus = String((match as any).status);
      const dbStatus = status === 'FINISHED' ? 'COMPLETED' : status;
      const ended = dbStatus === 'COMPLETED' || dbStatus === 'CANCELLED';
      await tx.match.update({ where: { id: matchId }, data: { status: dbStatus as any, ...(ended ? { endedAt: new Date() } : {}) } });
      await this.createEvent(tx, matchId, { type: 'MATCH_STATUS_CHANGED', payload: { status: dbStatus, ...(reason ? { reason } : {}) } });
      if (reason) {
        await this.createEvent(tx, matchId, { type: 'NOTE', payload: { text: reason, kind: dbStatus === 'CANCELLED' ? 'abandon' : 'status' } });
      }
      await this.bumpRevision(tx, matchId);
    });
    if (competitionId && (prevStatus === 'COMPLETED' || status === 'COMPLETED' || status === 'FINISHED' || status === 'CANCELLED' || prevStatus === 'CANCELLED')) {
      invalidateStandingsCache(competitionId);
    }
    await onMatchEventCommitted(matchId, 'MATCH_STATUS_CHANGED');
    return this.emitAndGet(matchId);
  }

  // ---------- state building (Stage 1 contract) ----------
  private static computeFlags(match: any, sets: any[]): MatchFlags {
    const cur = sets.find(s => s.setNumber === match.currentSetNumber) || sets[0];
    const target = cur?.targetPoints ?? (match.currentSetNumber === match.bestOfSets ? match.finalSetPoints : match.regularSetPoints);
    const minDiff = cur?.minDifference ?? match.minPointDifference ?? 2;
    const h = cur?.homePoints ?? 0, a = cur?.awayPoints ?? 0;
    const canWin = (hp: number, ap: number) => (Math.max(hp, ap) >= target && Math.abs(hp - ap) >= (minDiff - 1)) || (Math.max(hp, ap) >= target - 1 && Math.abs(hp - ap) >= minDiff - 1);
    const pointForA = canWin(h + 1, a) && (h + 1 >= target) && ((h + 1 - a) >= minDiff);
    const pointForB = canWin(h, a + 1) && (a + 1 >= target) && ((a + 1 - h) >= minDiff);
    const lead: TeamId | null = pointForA ? 'A' : pointForB ? 'B' : null;
    const setsA = match.setsWonHome || 0, setsB = match.setsWonAway || 0;
    const matchPoint: TeamId | null = lead ? ((lead === 'A' ? setsA : setsB) >= (match.setsToWin - 1) ? lead : null) : null;
    const completed = sets.filter(s => s.status === 'COMPLETED');
    const last = [...completed].sort((x,y)=>y.setNumber-x.setNumber)[0];
    const courtSwitchDue = match.currentSetNumber === match.bestOfSets && ((h + a) === 8 || (h >= 8 && a < 8 && h+a>8) || (a >= 8 && h < 8 && h+a>8)) && (h+a) <= 20 ? ((h+a) === 8) : false;
    const pendingEnd = !!cur?.pendingEnd;
    return {
      setPoint: lead,
      matchPoint,
      setWon: last?.winnerSide ? teamFromSide(last.winnerSide) : null,
      matchWon: match.status === 'COMPLETED' ? teamFromSide(match.winnerSide) : null,
      pendingEnd,
      courtSwitchDue,
      isDecidingSet: match.currentSetNumber === match.bestOfSets,
      technicalTimeoutDue: false,
    };
  }

  private static mapEvent(e: any): MatchEventData | null {
    if (!e) return null;
    return {
      id: e.id,
      seq: e.sequenceNumber,
      team: e.teamSide ? teamFromSide(e.teamSide) : null,
      action: e.type === 'ACTION_RECORDED' ? String((e.payload as any)?.action || 'ACTION') : e.type,
      time: new Date(e.eventTimestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      payload: e.payload,
      playerId: (e.payload as any)?.playerId || null,
      clientEventId: e.clientEventId || null,
    };
  }

  /**
   * Returns a copy of the match's sets with the result of the point/correction
   * applied, so a patch can describe set scores and flags without another read.
   */
  private static applyResultToSets(match: any, result: any): any[] {
    const sets = (match.sets || []).map((s: any) => ({ ...s }));
    if (!result?.set) return sets;
    const idx = sets.findIndex((s: any) => s.setNumber === result.set.setNumber);
    if (idx < 0) return sets;
    sets[idx] = { ...sets[idx], ...result.set };
    if (result.setCompleted) {
      sets[idx] = { ...sets[idx], status: 'COMPLETED', winnerSide: result.winnerSide || sets[idx].winnerSide, pendingEnd: false };
      if (!result.matchCompleted && result.nextSetNumber != null) {
        const next = sets.find((s: any) => s.setNumber === result.nextSetNumber);
        if (next) { next.status = 'READY'; next.servingSide = result.winnerSide || next.servingSide; }
      }
    }
    return sets;
  }

  private static buildScorePatch(input: {
    match: any;
    sets: any[];
    revision: number;
    status: MatchStatus;
    currentSetNumber: number;
    servingSide: Side;
    setsWonHome: number;
    setsWonAway: number;
    winnerSide?: Side | null;
    lastEvent?: MatchEventData | null;
  }): MatchStatePatch {
    const { match, sets, revision, status, currentSetNumber, servingSide, setsWonHome, setsWonAway } = input;
    const pseudoMatch = {
      ...match,
      status,
      currentSetNumber,
      servingSide,
      setsWonHome,
      setsWonAway,
      winnerSide: input.winnerSide ?? match.winnerSide ?? null,
    };
    const cur = sets.find((s) => s.setNumber === currentSetNumber) || sets[0];
    const scoreFor = (setNumber: number, key: 'homePoints' | 'awayPoints') =>
      sets.find((s) => s.setNumber === setNumber)?.[key] ?? 0;
    const setScoresA = Array.from({ length: 5 }, (_, i) => scoreFor(i + 1, 'homePoints'));
    const setScoresB = Array.from({ length: 5 }, (_, i) => scoreFor(i + 1, 'awayPoints'));
    const setHistory: SetHistoryItem[] = sets.map((s) => ({
      number: s.setNumber,
      scoreA: s.homePoints,
      scoreB: s.awayPoints,
      winner: s.winnerSide ? teamFromSide(s.winnerSide) : null,
      pendingEnd: !!s.pendingEnd,
    }));
    const committedAt = new Date().toISOString();
    return {
      id: match.id,
      revision,
      server_time: committedAt,
      status,
      current_set: currentSetNumber,
      server: teamFromSide(servingSide),
      teams: {
        A: { score: cur?.homePoints ?? 0, sets: setsWonHome },
        B: { score: cur?.awayPoints ?? 0, sets: setsWonAway },
      },
      set_scores: { A: setScoresA, B: setScoresB },
      setHistory,
      flags: this.computeFlags(pseudoMatch, sets),
      lastEvent: input.lastEvent ?? null,
      perf: { committedAt, source: 'patch' },
    };
  }

  /** Emits a compact delta and patches the in-memory state; returns the patched state if cached. */
  private static emitScorePatchAndGet(patch: MatchStatePatch, court: string | null | undefined): MatchState | null {
    patch.perf = { ...(patch.perf || {}), emittedAt: new Date().toISOString() };
    const patched = updateCachedMatchState(patch.id, (state) => applyMatchStatePatch(state, patch));
    broadcastMatchStatePatch(patch, court || patched?.court || null);
    this.scheduleRefresh(patch.id);
    return patched;
  }

  private static scheduleRefresh(matchId: string): void {
    scheduleMatchStateRefresh(
      matchId,
      () => this.buildMatchState(matchId),
      (fresh) => { void broadcastMatchState(fresh); },
      300,
    );
  }

  /** Runs broadcast/stat side effects off the request path. */
  private static queueSideEffect(matchId: string, eventType: string): void {
    setImmediate(() => {
      void onMatchEventCommitted(matchId, eventType).catch((e: any) => {
        logger.warn(`Post-write side effect ${eventType} failed for ${matchId}: ${e?.message || e}`);
      });
    });
  }

  static async getMatchState(matchId: string, opts?: { force?: boolean }): Promise<MatchState> {
    const started = Date.now();
    const state = await getOrLoadMatchState(
      matchId,
      () => this.buildMatchState(matchId),
      { maxAgeMs: opts?.force ? 0 : 30_000 },
    );
    state.perf = { ...(state.perf || {}), durationMs: Date.now() - started };
    return state;
  }

  private static async buildMatchState(matchId: string): Promise<MatchState> {
    // One round trip, only the columns the state contract needs. Previously
    // this read twice (with a best-effort lineup transaction in between) and
    // used include{} for every relation, which pulled full player rows.
    const m: any = await withDbRetry(() => prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true, status: true, winnerSide: true, currentSetNumber: true, bestOfSets: true,
        setsToWin: true, regularSetPoints: true, finalSetPoints: true, minPointDifference: true,
        rallyScoring: true, timeoutsPerSet: true, substitutionsPerSet: true, confirmSetEnd: true,
        servingSide: true, setsWonHome: true, setsWonAway: true, revision: true,
        tournamentName: true, division: true, court: true, venueType: true,
        competitionId: true, tournamentId: true, matchNumber: true, scheduledAt: true,
        startedAt: true, endedAt: true, homeTeamName: true, awayTeamName: true,
        homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true, logoKey: true, logoThumbKey: true, primaryColor: true, secondaryColor: true, textColor: true } },
        awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true, logoKey: true, logoThumbKey: true, primaryColor: true, secondaryColor: true, textColor: true } },
        competition: { select: { name: true, logoKey: true, logoThumbKey: true, logoUrl: true } },
        tournament: { select: { name: true } },
        sets: {
          select: { setNumber: true, homePoints: true, awayPoints: true, targetPoints: true, minDifference: true, status: true, pendingEnd: true, winnerSide: true, servingSide: true },
          orderBy: { setNumber: 'asc' },
        },
        events: {
          select: { id: true, sequenceNumber: true, type: true, teamSide: true, payload: true, eventTimestamp: true, clientEventId: true },
          orderBy: { sequenceNumber: 'desc' },
          take: 30,
        },
        teamStatistics: {
          select: { side: true, timeoutsUsed: true, substitutionsUsed: true, kills: true, errors: true, aces: true, blocks: true, digs: true, assists: true, sideoutAttempts: true, sideoutWins: true },
        },
        playerStatistics: {
          select: { playerId: true, side: true, points: true, kills: true, errors: true, aces: true, blocks: true, digs: true, assists: true },
        },
        officials: { select: { role: true, fullName: true } },
        rosters: {
          select: {
            side: true, playerId: true, jerseyNumber: true, isCaptain: true, isLibero: true,
            player: { select: { displayName: true, firstName: true, lastName: true, position: true, jerseyNumber: true, photoKey: true, thumbKey: true, photoUrl: true } },
          },
        },
        lineups: {
          select: {
            side: true, setNumber: true, playerId: true, rotationPos: true,
            player: { select: { displayName: true, firstName: true, lastName: true, position: true, jerseyNumber: true, photoKey: true, thumbKey: true, photoUrl: true } },
          },
        },
      },
    }), 'getMatchState');
    if (!m) throw new AppError('Match not found', 404);
    const curSet = m.sets.find((s: any) => s.setNumber === m.currentSetNumber) || m.sets[0];

    const buildTeam = (teamKey: TeamId): TeamMatchState => {
      const side: Side = sideFromTeam(teamKey);
      const team = teamKey === 'A' ? m.homeTeam : m.awayTeam;
      const stats = m.teamStatistics.find((s: any) => s.side === side);
      const playerStats = (m as any).playerStatistics?.filter((ps: any) => ps.side === side) || [];
      const statsFor = (id?: string | null): Record<string, number> | undefined => {
        if (!id) return undefined;
        const ps = playerStats.find((p: any) => p.playerId === id);
        if (!ps) return undefined;
        return {
          points: ps.points || 0, kill: ps.kills || 0, kills: ps.kills || 0,
          error: ps.errors || 0, errors: ps.errors || 0, ace: ps.aces || 0, aces: ps.aces || 0,
          block: ps.blocks || 0, blocks: ps.blocks || 0, dig: ps.digs || 0, digs: ps.digs || 0,
          assist: ps.assists || 0, assists: ps.assists || 0,
          attackAttempts: ps.attackAttempts || 0, attackErrors: ps.attackErrors || 0,
          receptionAttempts: ps.receptionAttempts || 0, receptionErrors: ps.receptionErrors || 0,
        };
      };
      const setLineup = m.lineups.filter((l: any) => l.side === side && l.setNumber === m.currentSetNumber).sort((a: any,b: any)=>a.rotationPos-b.rotationPos);
      const resolvePlayerPhoto = (p: any) => {
        const photoUrl = resolveStoredUrl(p?.photoKey) || resolveStoredUrl(p?.photoUrl) || null;
        const thumbUrl = resolveStoredUrl(p?.thumbKey) || photoUrl;
        return { photoUrl, thumbUrl };
      };
      const roster = m.rosters.filter((r: any) => r.side === side).map((r: any) => {
        const photo = resolvePlayerPhoto(r.player);
        return { id: r.playerId, jerseyNumber: r.jerseyNumber, name: r.player?.displayName || `${r.player?.firstName||''} ${r.player?.lastName||''}`.trim(), position: r.player?.position || null, isCaptain: r.isCaptain, isLibero: r.isLibero, heightCm: r.player?.heightCm ?? null, photoUrl: photo.photoUrl, thumbUrl: photo.thumbUrl, stats: statsFor(r.playerId) };
      });
      const onCourt: PlayerOnCourt[] = setLineup.length
        ? setLineup.map((l: any) => {
            const rosterPlayer = roster.find((r: any) => r.id === l.playerId);
            const photo = resolvePlayerPhoto(l.player);
            return { id: l.playerId, jerseyNumber: l.player.jerseyNumber ?? rosterPlayer?.jerseyNumber ?? null, name: l.player.displayName || `${l.player.firstName} ${l.player.lastName}`, position: l.player.position, isCaptain: !!rosterPlayer?.isCaptain, isLibero: !!rosterPlayer?.isLibero, heightCm: l.player.heightCm ?? rosterPlayer?.heightCm ?? null, photoUrl: photo.photoUrl || rosterPlayer?.photoUrl || null, thumbUrl: photo.thumbUrl || rosterPlayer?.thumbUrl || null, stats: statsFor(l.playerId) };
          })
        : roster.slice(0,6).map((r: any) => ({ id: r.id, jerseyNumber: r.jerseyNumber, name: r.name, position: r.position, isCaptain: r.isCaptain, isLibero: r.isLibero, heightCm: r.heightCm ?? null, photoUrl: r.photoUrl, thumbUrl: r.thumbUrl, stats: r.stats }));
      const bench = roster.filter((r: any) => !onCourt.find((o: any) => o.id === r.id));
      const rotationOrder = Array.from({ length: 6 }, (_, i) => {
        const p = onCourt[i];
        return p ? (p.jerseyNumber ?? p.id ?? null) : null;
      });
      const servingSide = (curSet?.servingSide || m.servingSide || 'HOME') as Side;
      let serverPosition: number | null = null;
      if (servingSide === side) {
        const statsRec: any = stats || {};
        const rotations = Number(statsRec.rotations || 0);
        // derive real server position from rotation count; if lineup known map to that slot, else positional index
        serverPosition = onCourt.length ? ((rotations % 6) + 1) : 1;
      }
      return {
        id: team?.id,
        name: team?.name || (teamKey === 'A' ? m.homeTeamName : m.awayTeamName),
        shortName: team?.shortName || (team?.name || (teamKey === 'A' ? m.homeTeamName : m.awayTeamName)).slice(0,4).toUpperCase(),
        logoUrl: resolveStoredUrl(team?.logoKey) || resolveStoredUrl(team?.logoUrl) || null,
        primaryColor: team?.primaryColor || null,
        secondaryColor: team?.secondaryColor || null,
        textColor: team?.textColor || null,
        score: teamKey === 'A' ? (curSet?.homePoints || 0) : (curSet?.awayPoints || 0),
        sets: teamKey === 'A' ? (m.setsWonHome || 0) : (m.setsWonAway || 0),
        timeouts: Math.max(0, (m.timeoutsPerSet || 2) - (stats?.timeoutsUsed || 0)),
        timeoutsUsed: stats?.timeoutsUsed || 0,
        timeoutsPerSet: m.timeoutsPerSet || 2,
        substitutionsUsed: (stats as any)?.substitutionsUsed || 0,
        substitutionsPerSet: m.substitutionsPerSet || 6,
        stats: { kill: stats?.kills || 0, error: stats?.errors || 0, ace: stats?.aces || 0, block: stats?.blocks || 0, dig: stats?.digs || 0, assist: stats?.assists || 0, side_out: stats?.sideoutWins || 0, sideout_attempts: stats?.sideoutAttempts || 0, sideout_wins: stats?.sideoutWins || 0 },
        lineup: onCourt,
        bench,
        rotationOrder,
        serverPosition,
      };
    };

    const teamA = buildTeam('A');
    const teamB = buildTeam('B');
    const setScoresA = Array.from({ length: 5 }, (_, i) => m.sets.find((s: any) => s.setNumber === i + 1)?.homePoints ?? 0);
    const setScoresB = Array.from({ length: 5 }, (_, i) => m.sets.find((s: any) => s.setNumber === i + 1)?.awayPoints ?? 0);
    const setHistory: SetHistoryItem[] = m.sets.map((s: any) => ({ number: s.setNumber, scoreA: s.homePoints, scoreB: s.awayPoints, winner: s.winnerSide ? teamFromSide(s.winnerSide) : null, pendingEnd: !!(s as any).pendingEnd }));
    const events = m.events.map((e: any) => ({
      id: e.id,
      seq: e.sequenceNumber,
      team: e.teamSide ? teamFromSide(e.teamSide) : null,
      action: e.type === 'ACTION_RECORDED' ? String((e.payload as any)?.action || 'ACTION') : e.type,
      time: new Date(e.eventTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      payload: e.payload,
      playerId: (e.payload as any)?.playerId || null,
      clientEventId: e.clientEventId || null,
    })).reverse();
    const ref1 = m.officials.find((o: any) => o.role === 'FIRST_REFEREE')?.fullName || '';
    const ref2 = m.officials.find((o: any) => o.role === 'SECOND_REFEREE')?.fullName || '';

    const state: MatchState = {
      id: m.id,
      status: (m.status as any),
      winner: m.winnerSide ? teamFromSide(m.winnerSide) : null,
      teams: { A: teamA, B: teamB },
      current_set: m.currentSetNumber,
      max_sets: m.bestOfSets,
      set_scores: { A: setScoresA, B: setScoresB },
      setHistory,
      server: teamFromSide(m.servingSide || curSet?.servingSide || 'HOME'),
      tournament: m.tournament?.name || m.competition?.name || m.tournamentName || '',
      competitionName: m.competition?.name || m.tournament?.name || m.tournamentName || null,
      competitionLogoUrl: resolveStoredUrl((m.competition as any)?.logoKey) || resolveStoredUrl((m.competition as any)?.logoThumbKey) || resolveStoredUrl((m.competition as any)?.logoUrl) || null,
      division: m.division || '',
      round: (m as any).round || null,
      court: m.court || '',
      venueType: (m as any).venueType || null,
      competitionId: m.competitionId || null,
      tournamentId: m.tournamentId || null,
      match_no: m.matchNumber || '',
      match_date: m.scheduledAt ? new Date(m.scheduledAt).toISOString().slice(0,10) : '',
      scheduledAt: m.scheduledAt ? new Date(m.scheduledAt).toISOString() : null,
      referee1: ref1,
      referee2: ref2,
      started_at: m.startedAt ? m.startedAt.toISOString() : '',
      ended_at: m.endedAt ? m.endedAt.toISOString() : null,
      server_time: new Date().toISOString(),
      events,
      flags: this.computeFlags(m, m.sets),
      revision: m.revision,
      lastEvent: events.length ? events[events.length - 1] : null,
      perf: { builtAt: new Date().toISOString(), source: 'db' },
      rules: { bestOfSets: m.bestOfSets, setsToWin: m.setsToWin, regularSetPoints: m.regularSetPoints, finalSetPoints: m.finalSetPoints, minPointDifference: m.minPointDifference, rallyScoring: m.rallyScoring, timeoutsPerSet: m.timeoutsPerSet, substitutionsPerSet: m.substitutionsPerSet, confirmSetEnd: (m as any).confirmSetEnd !== false },
    };
    return state;
  }

  private static async emitAndGet(matchId: string): Promise<MatchState> {
    // Non-scoring writes (roster, setup, undo, status) change parts of the state
    // a compact patch cannot express safely, so drop the cache and rebuild.
    invalidateMatchState(matchId);
    const state = await this.getMatchState(matchId, { force: true });
    await broadcastMatchState(state);
    return state;
  }

  // ---- existing analytics/report/history methods kept (best effort compatibility) ----
  static async getMatchAnalytics(matchId: string) {
    const match = await prisma.match.findUnique({ where: { id: matchId }, include: { sets: { orderBy: { setNumber: 'asc' } }, events: { orderBy: { sequenceNumber: 'asc' } }, playerStatistics: { include: { player: true } } } });
    if (!match) throw new AppError('Match not found', 404);
    const { computeMatchAnalytics } = await import('../engine/statisticsEngine.js');
    const events = match.events.map(e => ({ id: e.id, sequenceNumber: e.sequenceNumber, type: e.type, teamSide: e.teamSide as any, setId: e.setId, setNumber: (e.payload as any)?.setNumber ?? undefined, payload: e.payload, isCorrection: e.isCorrection, isReversal: e.isReversal, correctsEventId: e.correctsEventId, eventTimestamp: e.eventTimestamp }));
    const sets = match.sets.map(s => ({ id: s.id, setNumber: s.setNumber, homePoints: s.homePoints, awayPoints: s.awayPoints, status: s.status }));
    const players = match.playerStatistics.map(ps => ({ id: ps.playerId, name: ps.player ? `${ps.player.firstName} ${ps.player.lastName}`.trim() : ps.playerId, jerseyNumber: ps.player?.jerseyNumber ?? undefined, side: ps.side as any }));
    return computeMatchAnalytics(matchId, events as any, sets, { players, currentSet: match.currentSetNumber });
  }

  static async getMatchReport(matchId: string) {
    const state = await this.getMatchState(matchId);
    let analytics: any = null; try { analytics = await this.getMatchAnalytics(matchId); } catch {}
    return { matchId, state, analytics, integrity: { completedMatchesRetained: true, correctionsAuditable: true } };
  }

  static async getHistoricalAnalytics(_filters?: any) {
    const completedMatches = await prisma.match.count({ where: { status: 'COMPLETED' } });
    return { summary: { completedMatches }, teamPerformance: [], playerPerformance: [], tournamentStatistics: [], trends: [] };
  }

  // ---------- admin tools ----------
  static async resetMatch(matchId: string): Promise<MatchState> {
    const match = await prisma.match.findUnique({ where: { id: matchId }, include: { sets: true } });
    if (!match) throw new AppError('Match not found', 404);
    if (match.status === 'LIVE') throw new AppError('Cannot reset a live match. Pause or end it first.', 400);

    await prisma.$transaction(async (tx) => {
      await tx.matchEvent.deleteMany({ where: { matchId } });
      await tx.playerMatchStatistics.deleteMany({ where: { matchId } }).catch(() => {});
      await tx.teamMatchStatistics.deleteMany({ where: { matchId } }).catch(() => {});
      await tx.matchSet.deleteMany({ where: { matchId } });

      const bestOfSets = match.bestOfSets || 5;
      const regularSetPoints = match.regularSetPoints || 25;
      const finalSetPoints = match.finalSetPoints || 15;
      const minPointDifference = match.minPointDifference || 2;
      for (let i = 1; i <= bestOfSets; i++) {
        await tx.matchSet.create({
          data: {
            matchId,
            setNumber: i,
            homePoints: 0,
            awayPoints: 0,
            targetPoints: i === bestOfSets ? finalSetPoints : regularSetPoints,
            minDifference: minPointDifference,
            status: 'READY',
            servingSide: 'HOME',
          },
        });
      }
      await tx.teamMatchStatistics.createMany({ data: [{ matchId, side: 'HOME' as any }, { matchId, side: 'AWAY' as any }], skipDuplicates: true }).catch(() => {});

      await tx.match.update({
        where: { id: matchId },
        data: {
          status: 'SCHEDULED' as any,
          currentSetNumber: 1,
          servingSide: 'HOME' as any,
          setsWonHome: 0,
          setsWonAway: 0,
          startedAt: null,
          endedAt: null,
          winnerSide: null,
        } as any,
      });
      await this.createEvent(tx, matchId, { type: 'NOTE', payload: { note: 'Match reset to 0-0' } });
      await this.bumpRevision(tx, matchId);
    });

    await onMatchEventCommitted(matchId, 'NOTE');
    return this.emitAndGet(matchId);
  }

  static async archiveTestMatches(matchIds?: string[]): Promise<{ archived: string[]; skipped: string[] }> {
    const where: any = matchIds && matchIds.length
      ? { id: { in: matchIds } }
      : {
          status: { not: 'LIVE' as any },
          OR: [
            { matchNumber: { contains: 'test', mode: 'insensitive' } },
            { matchNumber: { contains: 'demo', mode: 'insensitive' } },
            { matchNumber: { contains: 'probe', mode: 'insensitive' } },
            { matchNumber: { contains: 'dev', mode: 'insensitive' } },
            { tournamentName: { contains: 'test', mode: 'insensitive' } },
            { tournamentName: { contains: 'demo', mode: 'insensitive' } },
            { tournamentName: { contains: 'probe', mode: 'insensitive' } },
            { homeTeamName: { contains: 'test', mode: 'insensitive' } },
            { awayTeamName: { contains: 'test', mode: 'insensitive' } },
          ],
        };
    const matches = await prisma.match.findMany({ where, select: { id: true, status: true } });
    const archived: string[] = [];
    const skipped: string[] = [];
    for (const m of matches) {
      if (m.status === 'LIVE') { skipped.push(m.id); continue; }
      try {
        await this.setStatus(m.id, 'CANCELLED' as any, 'Archived as test match');
        archived.push(m.id);
      } catch {
        skipped.push(m.id);
      }
    }
    return { archived, skipped };
  }

  // ---------- persistence helpers ----------
  private static async ensureIdempotent(tx: Tx, matchId: string, clientEventId?: string) {
    if (!clientEventId) return false;
    const existing = await tx.matchEvent.findUnique({ where: { matchId_clientEventId: { matchId, clientEventId } } }).catch(() => null);
    return !!existing;
  }

  private static async nextSeq(tx: Tx, matchId: string) {
    const last = await tx.matchEvent.findFirst({ where: { matchId }, orderBy: { sequenceNumber: 'desc' }, select: { sequenceNumber: true } });
    return (last?.sequenceNumber || 0) + 1;
  }

  private static async createEvent(tx: Tx, matchId: string, data: { setId?: string | null; type: string; teamSide?: Side | null; payload?: any; actorUserId?: string | null; clientEventId?: string | null; correctsEventId?: string | null; isCorrection?: boolean; isReversal?: boolean; note?: string | null }) {
    const seq = await this.nextSeq(tx, matchId);
    const event = await tx.matchEvent.create({
      data: {
        matchId,
        setId: data.setId || null,
        sequenceNumber: seq,
        type: data.type as any,
        teamSide: data.teamSide || null,
        actorUserId: data.actorUserId || null,
        payload: data.payload ?? undefined,
        correctsEventId: data.correctsEventId || null,
        isCorrection: !!data.isCorrection,
        isReversal: !!data.isReversal,
        clientEventId: data.clientEventId || null,
        note: data.note || null,
      }
    });
    return event;
  }

  private static stripUnknownPrismaArgs(err: any, dataObj: any) {
    const msg = String(err?.message || '');
    const unknown = Array.from(msg.matchAll(/Unknown argument `([^`]+)`/g)).map(m => m[1]);
    if (!unknown.length) return false;
    for (const k of unknown) { if (k in dataObj) delete dataObj[k]; }
    return true;
  }

  private static async safeUpdate(tx: any, model: 'match' | 'matchSet', args: any) {
    const dataObj = args?.data;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (model === 'match') return await tx.match.update(args);
        return await tx.matchSet.update(args);
      } catch (err: any) {
        if (attempt < 3 && dataObj && this.stripUnknownPrismaArgs(err, dataObj)) continue;
        throw err;
      }
    }
  }

  private static async safeCreateMatch(tx: any, args: any) {
    const dataObj = args?.data;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await tx.match.create(args);
      } catch (err: any) {
        if (attempt < 3 && dataObj && this.stripUnknownPrismaArgs(err, dataObj)) continue;
        throw err;
      }
    }
  }

  private static async bumpRevision(tx: Tx, matchId: string): Promise<number> {
    const updated = await tx.match.update({
      where: { id: matchId },
      data: { revision: { increment: 1 } },
      select: { revision: true },
    });
    return Number((updated as any)?.revision ?? 0);
  }

  private static async applyTeamPlayerStat(tx: Tx, matchId: string, side: Side, statKey: string, delta: number, playerId?: string) {
    const fieldMap: Record<string,string> = { kill:'kills', error:'errors', ace:'aces', block:'blocks', dig:'digs', assist:'assists', side_out:'sideoutWins' };
    const teamField = fieldMap[statKey] || statKey;
    await tx.teamMatchStatistics.update({ where: { matchId_side: { matchId, side } }, data: { [teamField]: { increment: delta } } as any }).catch(()=>{});
    if (playerId) {
      await this.ensurePlayerStats(tx, matchId, playerId, side);
      const playerField = fieldMap[statKey] || statKey;
      await tx.playerMatchStatistics.update({ where: { matchId_playerId: { matchId, playerId } }, data: { [playerField]: { increment: delta } } as any }).catch(()=>{});
    }
  }
}

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/database.js';
import { MatchService } from '../src/services/match.service.js';
import { CourtController, setCourtOnAir } from '../src/controllers/court.controller.js';

const RUN = process.env.RUN_DB_INTEGRATION === '1' && !!process.env.DATABASE_URL;

async function canConnect() {
  if (!RUN) return false;
  try { await prisma.$queryRaw`SELECT 1`; return true; } catch { return false; }
}

function mkReq(params: any = {}, body: any = {}) { return { params, body, headers: {} } as any; }
function mkRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  return res;
}

describe.runIf(RUN)('Court on-air and conflict rules (requires test Postgres)', () => {
  const suffix = `coa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const court = `Court ${suffix}`;
  let teamAId: string;
  let teamBId: string;
  let homePlayers: string[] = [];
  let awayPlayers: string[] = [];
  const createdMatchIds: string[] = [];

  async function makeReadyMatch(matchNo: string) {
    const matchId = await MatchService.createMatch({
      homeTeamId: teamAId,
      awayTeamId: teamBId,
      tournament: `T_${suffix}`,
      court,
      match_no: matchNo,
    } as any);
    createdMatchIds.push(matchId);
    await MatchService.replaceRoster(matchId, 'HOME', homePlayers.map((id, i) => ({ playerId: id, jerseyNumber: i + 1 })));
    await MatchService.replaceRoster(matchId, 'AWAY', awayPlayers.map((id, i) => ({ playerId: id, jerseyNumber: i + 1 })));
    await MatchService.setLineup(matchId, 'HOME', 1, { players: homePlayers.slice(0, 6).map((id, i) => ({ rotationPos: i + 1, playerId: id })) } as any);
    await MatchService.setLineup(matchId, 'AWAY', 1, { players: awayPlayers.slice(0, 6).map((id, i) => ({ rotationPos: i + 1, playerId: id })) } as any);
    return matchId;
  }

  beforeAll(async () => {
    const ok = await canConnect();
    expect(ok).toBe(true);
    const tA = await prisma.team.create({ data: { name: `A_${suffix}`, shortName: 'AA' } });
    const tB = await prisma.team.create({ data: { name: `B_${suffix}`, shortName: 'BB' } });
    teamAId = tA.id; teamBId = tB.id;
    for (let i = 1; i <= 6; i++) {
      homePlayers.push((await prisma.player.create({ data: { teamId: teamAId, firstName: `H${i}`, lastName: 'P', jerseyNumber: i } })).id);
      awayPlayers.push((await prisma.player.create({ data: { teamId: teamBId, firstName: `A${i}`, lastName: 'P', jerseyNumber: i } })).id);
    }
  });

  afterAll(async () => {
    if (!RUN) return;
    for (const id of createdMatchIds) {
      await prisma.broadcastGraphicState?.deleteMany?.({ where: { matchId: id } } as any).catch(() => {});
      await prisma.matchEvent.deleteMany({ where: { matchId: id } }).catch(() => {});
      await prisma.matchSet.deleteMany({ where: { matchId: id } }).catch(() => {});
      await prisma.teamMatchStatistics.deleteMany({ where: { matchId: id } }).catch(() => {});
      await prisma.playerMatchStatistics.deleteMany({ where: { matchId: id } }).catch(() => {});
      await prisma.matchRosterEntry.deleteMany({ where: { matchId: id } }).catch(() => {});
      await prisma.matchLineup.deleteMany({ where: { matchId: id } }).catch(() => {});
      await prisma.match.delete({ where: { id } }).catch(() => {});
    }
    await (prisma as any).courtOnAir?.deleteMany?.({ where: { courtKey: court.toLowerCase().replace(/[^a-z0-9]+/g, '') } }).catch(() => {});
    await prisma.player.deleteMany({ where: { teamId: { in: [teamAId, teamBId] } } }).catch(() => {});
    await prisma.team.deleteMany({ where: { id: { in: [teamAId, teamBId] } } }).catch(() => {});
  });

  it('new match starts clean at 0-0', async () => {
    const matchId = await makeReadyMatch('101');
    const state = await MatchService.getMatchState(matchId);
    expect(state.current_set).toBe(1);
    expect(state.teams.A.score).toBe(0);
    expect(state.teams.B.score).toBe(0);
    expect(state.teams.A.sets).toBe(0);
    expect(state.teams.B.sets).toBe(0);
    expect(state.status).toBe('SCHEDULED');
    expect(state.events?.length || 0).toBeLessThanOrEqual(1); // creation note
  });

  it('enforces one in-play match per court on goLive', async () => {
    const a = await makeReadyMatch('102');
    const b = await makeReadyMatch('103');
    await MatchService.goLive(a);
    await expect(MatchService.goLive(b)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('court active match prefers explicit on-air assignment', async () => {
    const onAir = await makeReadyMatch('104');
    await setCourtOnAir(court, onAir);
    const res = mkRes();
    await CourtController.activeMatch(mkReq({ court }), res, (e: any) => { throw e; });
    expect(res.body?.data?.matchId).toBe(onAir);
    expect(res.body?.data?.source).toBe('on_air');
  });
});

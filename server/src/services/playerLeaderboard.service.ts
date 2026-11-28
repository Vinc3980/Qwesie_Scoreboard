import { prisma } from '../config/database.js';

export type PlayerBoardCategory = 'points'|'kills'|'aces'|'blocks'|'digs'|'assists'|'attackErrors'|'pointsPerSet'|'killEfficiency';

export async function getPlayerLeaderboard(opts: { competitionId: string; category: PlayerBoardCategory; division?: string|null; group?: string|null; teamId?: string|null; from?: Date|null; to?: Date|null; minMatches?: number; provisional?: boolean; limit?: number; }) {
  const whereMatch: any = { competitionId: opts.competitionId, status: opts.provisional ? { in: ['COMPLETED','LIVE','BETWEEN_SETS','PAUSED','SUSPENDED'] } : 'COMPLETED' };
  if (opts.division) whereMatch.division = opts.division;
  if (opts.group) whereMatch.group = opts.group;
  if (opts.from || opts.to) { whereMatch.scheduledAt = {}; if (opts.from) whereMatch.scheduledAt.gte = opts.from; if (opts.to) whereMatch.scheduledAt.lte = opts.to; }
  if (opts.teamId) whereMatch.OR = [{ homeTeamId: opts.teamId }, { awayTeamId: opts.teamId }];

  const stats = await prisma.playerMatchStatistics.findMany({
    where: { match: whereMatch, ...(opts.teamId ? { teamId: opts.teamId } : {}) },
    select: {
      playerId:true, teamId:true, points:true, kills:true, blocks:true, aces:true, digs:true, assists:true, attackErrors:true, totalAttackAttempts:true, receptionAttempts:true, receptionErrors:true, serveAttempts:true, serveErrors:true, setsPlayed:true,
      player: { select: { id:true, firstName:true, lastName:true, displayName:true, photoKey:true, photoUrl:true, thumbKey:true, thumbUrl:true } },
      team: { select: { id:true, name:true, shortName:true, logoUrl:true } },
      matchId:true,
    },
  } as any);

  const byPlayer = new Map<string, any>();
  for (const s of stats as any[]) {
    const k = s.playerId;
    if (!byPlayer.has(k)) byPlayer.set(k, { playerId:k, name: s.player?.displayName || `${s.player?.firstName||''} ${s.player?.lastName||''}`.trim(), photoUrl: s.player?.photoUrl || s.player?.thumbUrl || null, teamId: s.teamId, teamName: s.team?.name || '', teamShortName: s.team?.shortName || null, teamLogoUrl: s.team?.logoUrl || null, teamIds: new Set<string>(), matches: new Set(), points:0,kills:0,aces:0,blocks:0,digs:0,assists:0,attackErrors:0,setsPlayed:0,attackAttempts:0 });
    const r = byPlayer.get(k);
    r.matches.add(s.matchId);
    r.teamIds.add(s.teamId);
    // keep latest seen team info (handles team changes reasonably)
    r.teamId = s.teamId; r.teamName = s.team?.name || r.teamName; r.teamShortName = s.team?.shortName || r.teamShortName; r.teamLogoUrl = s.team?.logoUrl || r.teamLogoUrl;
    r.points += s.points||0; r.kills += s.kills||0; r.aces += s.aces||0; r.blocks += s.blocks||0; r.digs += s.digs||0; r.assists += s.assists||0; r.attackErrors += s.attackErrors||0; r.setsPlayed += s.setsPlayed||0; r.attackAttempts += s.totalAttackAttempts||0;
  }

  const minMatches = Math.max(1, Number(opts.minMatches) || 1);
  const cat = opts.category;
  const valueOf = (r: any) => {
    if (cat==='points') return r.points;
    if (cat==='kills') return r.kills;
    if (cat==='aces') return r.aces;
    if (cat==='blocks') return r.blocks;
    if (cat==='digs') return r.digs;
    if (cat==='assists') return r.assists;
    if (cat==='attackErrors') return r.attackErrors;
    if (cat==='pointsPerSet') return r.setsPlayed ? r.points / r.setsPlayed : 0;
    if (cat==='killEfficiency') return r.attackAttempts ? r.kills / r.attackAttempts : 0;
    return r.points;
  };

  let rows = Array.from(byPlayer.values()).map(r => ({ ...r, matchesPlayed: r.matches.size, teamChanged: (r.teamIds?.size || 0) > 1, value: valueOf(r), perSet: r.setsPlayed ? r.points / r.setsPlayed : 0 })).filter(r => r.matchesPlayed >= minMatches);
  const asc = cat === 'attackErrors';
  rows.sort((a,b) => (asc ? a.value - b.value : b.value - a.value) || b.points - a.points || a.name.localeCompare(b.name));
  // ties share ranks
  let rank = 0; let lastVal: any = null;
  rows = rows.map((r, i) => { if (i===0 || r.value !== lastVal) { rank = i+1; lastVal = r.value; } return { rank, ...r, matches: undefined }; });
  const limit = Math.max(1, Math.min(100, Number(opts.limit) || 20));
  rows = rows.slice(0, limit);

  // data coverage: attributed scoring events / total scoring events in scope
  const matchIds = Array.from(new Set((stats as any[]).map(s => s.matchId)));
  let coverage = { attributed: 0, total: 0, pct: null as number|null };
  if (matchIds.length) {
    const events = await prisma.matchEvent.findMany({ where: { matchId: { in: matchIds }, type: { in: ['POINT_AWARDED','ACTION_RECORDED'] as any } }, select: { payload:true } } as any);
    for (const e of events as any[]) { coverage.total++; if (e.payload?.playerId) coverage.attributed++; }
    coverage.pct = coverage.total ? Math.round((coverage.attributed / coverage.total) * 1000) / 10 : null;
  }

  return { category: cat, rows, coverage, generatedAt: new Date().toISOString() };
}

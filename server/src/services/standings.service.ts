import { prisma } from '../config/database.js';

export type TieBreakKey = 'points' | 'wins' | 'setRatio' | 'pointRatio' | 'headToHead';
export type PointsRule = {
  preset?: 'fivb' | 'simple3' | 'simple2' | 'custom';
  win3_0?: number; win3_1?: number; win3_2?: number; loss2_3?: number; loss1_3?: number; loss0_3?: number;
  forfeitWin?: number; forfeitLoss?: number;
};
export type StandingsConfig = {
  tieBreakOrder?: TieBreakKey[];
  qualificationZones?: Array<{ toRank: number; label: string; color: string }>;
};

export type NormalizedPointsRule = Required<Pick<PointsRule,'win3_0'|'win3_1'|'win3_2'|'loss2_3'|'loss1_3'|'loss0_3'|'forfeitWin'|'forfeitLoss'>> & { preset: 'fivb'|'simple2'|'simple3'|'custom' };
export const DEFAULT_POINTS_RULE: NormalizedPointsRule = {
  preset: 'fivb', win3_0: 3, win3_1: 3, win3_2: 2, loss2_3: 1, loss1_3: 0, loss0_3: 0, forfeitWin: 3, forfeitLoss: 0,
};
export const DEFAULT_TIEBREAK: TieBreakKey[] = ['points', 'wins', 'setRatio', 'pointRatio', 'headToHead'];

export function normalizePointsRule(raw: any): NormalizedPointsRule {
  const preset = raw?.preset;
  if (preset === 'simple2') return { ...DEFAULT_POINTS_RULE, preset: 'simple2', win3_0: 2, win3_1: 2, win3_2: 2, loss2_3: 0, loss1_3: 0, loss0_3: 0, forfeitWin: 2, forfeitLoss: 0 };
  if (preset === 'simple3') return { ...DEFAULT_POINTS_RULE, preset: 'simple3', win3_0: 3, win3_1: 3, win3_2: 3, loss2_3: 0, loss1_3: 0, loss0_3: 0, forfeitWin: 3, forfeitLoss: 0 };
  const base: NormalizedPointsRule = { ...DEFAULT_POINTS_RULE, preset: preset === 'custom' ? 'custom' : 'fivb' };
  for (const k of ['win3_0','win3_1','win3_2','loss2_3','loss1_3','loss0_3','forfeitWin','forfeitLoss'] as const) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && v !== '') base[k] = Math.max(0, Math.min(10, Number(v) || 0));
  }
  return base;
}

export function normalizeStandingsConfig(raw: any): StandingsConfig {
  const order = Array.isArray(raw?.tieBreakOrder) ? raw.tieBreakOrder.filter((x: any) => DEFAULT_TIEBREAK.includes(x)) : [];
  const tieBreakOrder = order.length ? Array.from(new Set([...order, ...DEFAULT_TIEBREAK])) as TieBreakKey[] : [...DEFAULT_TIEBREAK];
  const qualificationZones = Array.isArray(raw?.qualificationZones) ? raw.qualificationZones.map((z: any) => ({ toRank: Math.max(1, Number(z?.toRank)||1), label: String(z?.label||'').slice(0,40), color: String(z?.color||'#22c55e').slice(0,20) })).filter((z: any) => z.label) : [];
  return { tieBreakOrder, qualificationZones };
}

type MatchForStandings = {
  id: string; status: string; homeTeamId: string|null; awayTeamId: string|null; homeTeamName: string; awayTeamName: string;
  setsWonHome: number; setsWonAway: number; winnerSide: 'HOME'|'AWAY'|null; forfeitWinnerSide: 'HOME'|'AWAY'|null; scheduledAt: Date|null; division: string|null; group: string|null;
  homeTeam?: { id:string; name:string; shortName:string|null; logoUrl:string|null }|null;
  awayTeam?: { id:string; name:string; shortName:string|null; logoUrl:string|null }|null;
  sets: Array<{ homePoints:number; awayPoints:number; winnerSide:'HOME'|'AWAY'|null; status:string }>;
};

export type StandingRow = {
  rank: number; teamId: string; teamName: string; shortName: string|null; logoUrl: string|null;
  played: number; won: number; lost: number;
  setsFor: number; setsAgainst: number; setRatio: number|null;
  pointsFor: number; pointsAgainst: number; pointRatio: number|null;
  matchPoints: number; form: string[]; // W/L newest last (last 5)
};

function ratio(a: number, b: number): number | null { if (b === 0) return a > 0 ? Number.POSITIVE_INFINITY : null; return a / b; }
function finiteRatio(a: number, b: number): number { if (b === 0) return a > 0 ? 999999 : 0; return a / b; }

function matchPointsForSide(m: MatchForStandings, side: 'HOME'|'AWAY', rule: ReturnType<typeof normalizePointsRule>) {
  const won = m.winnerSide === side || m.forfeitWinnerSide === side;
  const lost = m.winnerSide !== null && m.winnerSide !== side || (m.forfeitWinnerSide !== null && m.forfeitWinnerSide !== side);
  if (m.forfeitWinnerSide) {
    if (m.forfeitWinnerSide === side) return { mp: rule.forfeitWin, w: 1, l: 0, sf: 3, sa: 0, pf: 75, pa: 0, result: 'W' as const };
    return { mp: rule.forfeitLoss, w: 0, l: 1, sf: 0, sa: 3, pf: 0, pa: 75, result: 'L' as const };
  }
  const sf = side === 'HOME' ? m.setsWonHome : m.setsWonAway;
  const sa = side === 'HOME' ? m.setsWonAway : m.setsWonHome;
  const pf = m.sets.reduce((s,set)=>s + (side === 'HOME' ? set.homePoints : set.awayPoints), 0);
  const pa = m.sets.reduce((s,set)=>s + (side === 'HOME' ? set.awayPoints : set.homePoints), 0);
  let mp = 0;
  if (won) {
    if (sa === 2) mp = rule.win3_2;
    else if (sa === 1) mp = rule.win3_1;
    else mp = rule.win3_0;
  } else if (lost) {
    if (sf === 2) mp = rule.loss2_3;
    else if (sf === 1) mp = rule.loss1_3;
    else mp = rule.loss0_3;
  }
  return { mp, w: won ? 1 : 0, l: lost ? 1 : 0, sf, sa, pf, pa, result: won ? 'W' as const : 'L' as const };
}

export function computeStandings(matches: MatchForStandings[], ruleRaw: any, configRaw: any): { rows: StandingRow[]; tieBreakOrder: TieBreakKey[] } {
  const rule = normalizePointsRule(ruleRaw);
  const cfg = normalizeStandingsConfig(configRaw);
  const teamMap = new Map<string, StandingRow & { _id: string }>();
  const ensure = (id: string, name: string, shortName: string|null, logoUrl: string|null) => {
    if (!teamMap.has(id)) teamMap.set(id, { _id: id, rank: 0, teamId: id, teamName: name, shortName, logoUrl, played: 0, won: 0, lost: 0, setsFor: 0, setsAgainst: 0, setRatio: null, pointsFor: 0, pointsAgainst: 0, pointRatio: null, matchPoints: 0, form: [] });
    const r = teamMap.get(id)!;
    if (name && !r.teamName) r.teamName = name;
    if (shortName && !r.shortName) r.shortName = shortName;
    if (logoUrl && !r.logoUrl) r.logoUrl = logoUrl;
    return r;
  };

  const completed = matches.filter(m => m.status === 'COMPLETED' && (m.homeTeamId || m.awayTeamId));
  completed.sort((a,b) => (new Date(a.scheduledAt || 0).getTime()) - (new Date(b.scheduledAt || 0).getTime()));
  for (const m of completed) {
    const homeId = m.homeTeamId || `name:${m.homeTeamName}`
    const awayId = m.awayTeamId || `name:${m.awayTeamName}`
    const h = ensure(homeId, m.homeTeam?.name || m.homeTeamName, m.homeTeam?.shortName || null, m.homeTeam?.logoUrl || null);
    const a = ensure(awayId, m.awayTeam?.name || m.awayTeamName, m.awayTeam?.shortName || null, m.awayTeam?.logoUrl || null);
    const hs = matchPointsForSide(m, 'HOME', rule);
    const as = matchPointsForSide(m, 'AWAY', rule);
    for (const [row, s] of [[h,hs],[a,as]] as const) {
      row.played += 1; row.won += s.w; row.lost += s.l; row.setsFor += s.sf; row.setsAgainst += s.sa; row.pointsFor += s.pf; row.pointsAgainst += s.pa; row.matchPoints += s.mp; row.form.push(s.result);
    }
  }
  for (const r of teamMap.values()) {
    r.form = r.form.slice(-5);
    r.setRatio = ratio(r.setsFor, r.setsAgainst);
    r.pointRatio = ratio(r.pointsFor, r.pointsAgainst);
  }

  const rows = Array.from(teamMap.values());
  const headToHead = (a: StandingRow, b: StandingRow) => {
    // mini-league between tied teams - simplified: direct matches points/sets/points ratio
    const direct = completed.filter(m => {
      const hid = m.homeTeamId || `name:${m.homeTeamName}`; const aid = m.awayTeamId || `name:${m.awayTeamName}`;
      return (hid === a.teamId && aid === b.teamId) || (hid === b.teamId && aid === a.teamId);
    });
    if (!direct.length) return 0;
    let ap=0,bp=0,asf=0,asa=0,apf=0,apa=0,bsf=0,bsa=0,bpf=0,bpa=0;
    for (const m of direct) {
      const hid = m.homeTeamId || `name:${m.homeTeamName}`
      const aSide: 'HOME'|'AWAY' = hid === a.teamId ? 'HOME' : 'AWAY';
      const bSide: 'HOME'|'AWAY' = aSide === 'HOME' ? 'AWAY' : 'HOME';
      const ar = matchPointsForSide(m, aSide, rule); const br = matchPointsForSide(m, bSide, rule);
      ap+=ar.mp; bp+=br.mp; asf+=ar.sf; asa+=ar.sa; apf+=ar.pf; apa+=ar.pa; bsf+=br.sf; bsa+=br.sa; bpf+=br.pf; bpa+=br.pa;
    }
    if (ap !== bp) return bp - ap;
    const asr = finiteRatio(asf,asa), bsr = finiteRatio(bsf,bsa); if (asr !== bsr) return bsr - asr;
    const apr = finiteRatio(apf,apa), bpr = finiteRatio(bpf,bpa); if (apr !== bpr) return bpr - apr;
    return 0;
  };

  rows.sort((a,b) => {
    for (const key of cfg.tieBreakOrder || DEFAULT_TIEBREAK) {
      if (key === 'points' && a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
      if (key === 'wins' && a.won !== b.won) return b.won - a.won;
      if (key === 'setRatio') { const d = finiteRatio(b.setsFor,b.setsAgainst) - finiteRatio(a.setsFor,a.setsAgainst); if (d !== 0) return d; }
      if (key === 'pointRatio') { const d = finiteRatio(b.pointsFor,b.pointsAgainst) - finiteRatio(a.pointsFor,a.pointsAgainst); if (d !== 0) return d; }
      if (key === 'headToHead') { const d = headToHead(a,b); if (d !== 0) return d; }
    }
    return a.teamName.localeCompare(b.teamName);
  });
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { rows, tieBreakOrder: cfg.tieBreakOrder || DEFAULT_TIEBREAK };
}

const standingsCache = new Map<string, { at: number; value: any }>();
const STANDINGS_TTL_MS = 30_000;
export function invalidateStandingsCache(competitionId?: string) {
  if (!competitionId) { standingsCache.clear(); return; }
  for (const k of standingsCache.keys()) if (k.startsWith(competitionId + ':')) standingsCache.delete(k);
}

export async function getCompetitionStandings(competitionId: string, opts: { division?: string|null; group?: string|null; provisional?: boolean } = {}) {
  const key = `${competitionId}:${opts.division||''}:${opts.group||''}:${opts.provisional?'1':'0'}`;
  const cached = standingsCache.get(key);
  if (cached && Date.now() - cached.at < STANDINGS_TTL_MS) return cached.value;
  const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
  if (!competition) return null;
  const where: any = { competitionId, status: opts.provisional ? { in: ['COMPLETED','LIVE','BETWEEN_SETS','PAUSED','SUSPENDED'] } : 'COMPLETED' };
  if (opts.division) where.division = opts.division;
  if (opts.group) where.group = opts.group;
  const matches = await prisma.match.findMany({
    where,
    select: {
      id:true,status:true,homeTeamId:true,awayTeamId:true,homeTeamName:true,awayTeamName:true,setsWonHome:true,setsWonAway:true,winnerSide:true,forfeitWinnerSide:true,scheduledAt:true,division:true,group:true,
      homeTeam:{select:{id:true,name:true,shortName:true,logoUrl:true}},
      awayTeam:{select:{id:true,name:true,shortName:true,logoUrl:true}},
      sets:{select:{homePoints:true,awayPoints:true,winnerSide:true,status:true}},
    },
    orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
  } as any);
  const { rows, tieBreakOrder } = computeStandings(matches as any, (competition as any).pointsRule, (competition as any).standingsConfig);
  const cfg = normalizeStandingsConfig((competition as any).standingsConfig);
  const value = { competitionId, competitionName: competition.name, season: competition.season, division: opts.division || null, group: opts.group || null, provisional: !!opts.provisional, tieBreakOrder, qualificationZones: cfg.qualificationZones || [], rows, generatedAt: new Date().toISOString() };
  standingsCache.set(key, { at: Date.now(), value });
  return value;
}

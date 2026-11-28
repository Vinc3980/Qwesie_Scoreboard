import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { getCompetitionStandings, invalidateStandingsCache, normalizePointsRule, normalizeStandingsConfig } from '../services/standings.service.js';
const ok = (res: Response, data: any, message?: string) => res.json({ success: true, data, message, timestamp: new Date().toISOString() });

function parsePointsRule(b: any) {
  if (b.pointsRule === undefined) return undefined;
  return normalizePointsRule(b.pointsRule);
}
function parseStandingsConfig(b: any) {
  if (b.standingsConfig === undefined) return undefined;
  return normalizeStandingsConfig(b.standingsConfig) as any;
}

export class CompetitionsController {
  static async list(_req: Request, res: Response, next: NextFunction) { try { ok(res, await prisma.competition.findMany({ orderBy: { createdAt: 'desc' }, include: { tournaments: true, _count: { select: { matches: true } } } })); } catch(e){next(e);} }
  static async get(req: Request, res: Response, next: NextFunction) { try { ok(res, await prisma.competition.findUnique({ where: { id: req.params.id }, include: { tournaments: true } })); } catch(e){next(e);} }
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const b=req.body||{};
      const data: any = { name:String(b.name||'Competition'), season:b.season||null, organizer:b.organizer||null, description:b.description||null };
      const pr = parsePointsRule(b); if (pr !== undefined) data.pointsRule = pr as any;
      const sc = parseStandingsConfig(b); if (sc !== undefined) data.standingsConfig = sc;
      ok(res, await prisma.competition.create({ data }), 'Competition created');
    } catch(e){next(e);}
  }
  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const b=req.body||{}; const data:any={};
      for(const k of ['name','season','organizer','description']) if(b[k]!==undefined) data[k]=b[k];
      const pr = parsePointsRule(b); if (pr !== undefined) data.pointsRule = pr as any;
      const sc = parseStandingsConfig(b); if (sc !== undefined) data.standingsConfig = sc;
      const row = await prisma.competition.update({ where:{id:req.params.id}, data });
      invalidateStandingsCache(req.params.id);
      ok(res, row, 'Competition updated');
    } catch(e){next(e);}
  }
  static async remove(req: Request, res: Response, next: NextFunction) { try { await prisma.competition.delete({ where:{id:req.params.id} }); invalidateStandingsCache(req.params.id); ok(res,{id:req.params.id},'Competition deleted'); } catch(e){next(e);} }

  static async standings(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const division = typeof req.query.division === 'string' ? req.query.division : undefined;
      const group = typeof req.query.group === 'string' ? req.query.group : undefined;
      const provisional = req.query.provisional === 'true';
      const data = await getCompetitionStandings(id, { division, group, provisional });
      if (!data) return res.status(404).json({ success:false, error:{ message:'Competition not found' }, timestamp: new Date().toISOString() });
      ok(res, data);
    } catch(e){next(e);}
  }

  static async fixtures(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { division, group, court, teamId, status, from, to, q, limit, offset } = req.query as any;
      const where: any = { competitionId: id };
      if (division) where.division = String(division);
      if (group) where.group = String(group);
      if (court) where.court = String(court);
      if (status) where.status = String(status);
      if (teamId) where.OR = [{ homeTeamId: String(teamId) }, { awayTeamId: String(teamId) }];
      if (from || to) {
        where.scheduledAt = {};
        if (from) where.scheduledAt.gte = new Date(String(from));
        if (to) where.scheduledAt.lte = new Date(String(to));
      }
      if (q) {
        const s = String(q);
        where.AND = [...(where.AND||[]), { OR: [{ homeTeamName: { contains: s, mode: 'insensitive' } }, { awayTeamName: { contains: s, mode: 'insensitive' } }, { matchNumber: { contains: s, mode: 'insensitive' } }, { court: { contains: s, mode: 'insensitive' } }] }];
      }
      const take = Math.max(1, Math.min(500, Number(limit) || 200));
      const skip = Math.max(0, Number(offset) || 0);
      const [items, total] = await Promise.all([
        prisma.match.findMany({
          where,
          orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
          take, skip,
          select: {
            id:true, matchNumber:true, scheduledAt:true, status:true, court:true, division:true, group:true, round:true,
            homeTeamId:true, awayTeamId:true, homeTeamName:true, awayTeamName:true, setsWonHome:true, setsWonAway:true, winnerSide:true, forfeitWinnerSide:true,
            homeTeam:{select:{id:true,name:true,shortName:true,logoUrl:true}},
            awayTeam:{select:{id:true,name:true,shortName:true,logoUrl:true}},
            sets:{select:{setNumber:true,homePoints:true,awayPoints:true,status:true,winnerSide:true}, orderBy:{setNumber:'asc'}},
          },
        } as any),
        prisma.match.count({ where }),
      ]);
      ok(res, { items, total, limit: take, offset: skip });
    } catch(e){next(e);}
  }

  static async divisions(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const rows = await prisma.match.findMany({ where: { competitionId: id, division: { not: null } }, select: { division: true }, distinct: ['division'] as any });
      ok(res, rows.map(r => r.division).filter(Boolean));
    } catch(e){next(e);}
  }

  static async generateFixturesPreview(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const b = req.body || {};
      const teamIds: string[] = Array.isArray(b.teamIds) ? b.teamIds.filter(Boolean) : [];
      const double = !!b.doubleRoundRobin;
      const startDate = b.startDate ? new Date(String(b.startDate)) : new Date();
      const slots: string[] = Array.isArray(b.timeSlots) && b.timeSlots.length ? b.timeSlots : ['18:00'];
      const courts: string[] = Array.isArray(b.courts) && b.courts.length ? b.courts.map(String) : ['1'];
      const durationMin = Math.max(30, Number(b.matchDurationMinutes) || 90);
      const division = b.division ? String(b.division) : null;
      const group = b.group ? String(b.group) : null;
      const roundLabel = b.round ? String(b.round) : null;
      if (teamIds.length < 2) return res.status(400).json({ success:false, error:{ message:'At least 2 teams required' }, timestamp: new Date().toISOString() });
      const teams = await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id:true, name:true, shortName:true } });
      const byId = new Map(teams.map(t => [t.id, t]));
      const ordered = teamIds.filter(t => byId.has(t));
      if (ordered.length % 2 === 1) ordered.push('BYE');
      const n = ordered.length;
      const rounds: Array<Array<[string,string]>> = [];
      const arr = [...ordered];
      for (let r = 0; r < n - 1; r++) {
        const pairs: Array<[string,string]> = [];
        for (let i = 0; i < n / 2; i++) {
          const a = arr[i], b2 = arr[n - 1 - i];
          if (a !== 'BYE' && b2 !== 'BYE') pairs.push(r % 2 === 0 ? [a,b2] : [b2,a]);
        }
        rounds.push(pairs);
        arr.splice(1, 0, arr.pop() as string);
      }
      const allRounds = double ? [...rounds, ...rounds.map(pr => pr.map(([a,b]) => [b,a] as [string,string]))] : rounds;
      const preview: any[] = [];
      let dayOffset = 0; let slotIdx = 0; let courtIdx = 0;
      for (let ri = 0; ri < allRounds.length; ri++) {
        for (const [homeTeamId, awayTeamId] of allRounds[ri]) {
          const slot = slots[slotIdx % slots.length];
          const [hh, mm] = slot.split(':').map(Number);
          const dt = new Date(startDate); dt.setHours(hh||18, mm||0, 0, 0); dt.setDate(dt.getDate() + dayOffset);
          const court = courts[courtIdx % courts.length];
          preview.push({
            homeTeamId, awayTeamId,
            homeTeamName: byId.get(homeTeamId)?.name || homeTeamId,
            awayTeamName: byId.get(awayTeamId)?.name || awayTeamId,
            scheduledAt: dt.toISOString(), court, division, group, round: roundLabel || `Round ${ri+1}`, durationMinutes: durationMin,
          });
          courtIdx++;
          if (courtIdx % courts.length === 0) { slotIdx++; if (slotIdx % slots.length === 0) { dayOffset++; } }
        }
        dayOffset++; slotIdx = 0; courtIdx = 0; // next round on next day block
      }
      // validate no team twice in same slot
      const slotMap = new Map<string, Set<string>>();
      for (const p of preview) { const k = p.scheduledAt+'|'+p.court; const set = slotMap.get(k) || new Set(); if (set.has(p.homeTeamId) || set.has(p.awayTeamId)) { /* should not happen */ } set.add(p.homeTeamId); set.add(p.awayTeamId); slotMap.set(k,set); }
      ok(res, { competitionId: id, preview });
    } catch(e){next(e);}
  }

  static async commitFixtures(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!items.length) return res.status(400).json({ success:false, error:{ message:'No fixtures to create' }, timestamp:new Date().toISOString() });
      const created = await prisma.$transaction(async (tx) => {
        const out: any[] = [];
        for (const it of items) {
          const homeTeam = it.homeTeamId ? await tx.team.findUnique({ where:{id:String(it.homeTeamId)} }) : null;
          const awayTeam = it.awayTeamId ? await tx.team.findUnique({ where:{id:String(it.awayTeamId)} }) : null;
          const m = await tx.match.create({ data: {
            competitionId: id,
            homeTeamId: homeTeam?.id || null,
            awayTeamId: awayTeam?.id || null,
            homeTeamName: homeTeam?.name || String(it.homeTeamName||'HOME TEAM'),
            awayTeamName: awayTeam?.name || String(it.awayTeamName||'AWAY TEAM'),
            scheduledAt: it.scheduledAt ? new Date(it.scheduledAt) : null,
            court: it.court ? String(it.court) : null,
            division: it.division ? String(it.division) : null,
            group: it.group ? String(it.group) : null,
            round: it.round ? String(it.round) : null,
            status: 'SCHEDULED',
          } as any });
          out.push(m);
        }
        return out;
      });
      invalidateStandingsCache(id);
      ok(res, { created: created.length, items: created }, 'Fixtures created');
    } catch(e){next(e);}
  }
}

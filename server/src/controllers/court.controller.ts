import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { normalizeCourt } from '../utils/court.js';
import { broadcastCourtActiveChanged } from '../sockets/socketManager.js';

const IN_PLAY = ['LIVE', 'PAUSED', 'BETWEEN_SETS', 'SUSPENDED'] as const;
const PRE_MATCH = ['READY', 'SCHEDULED'] as const;

export function courtKey(courtParam: string): string | null {
  return normalizeCourt(courtParam);
}

async function findMatchForCourt(courtParam: string, statuses: readonly string[], orderBy: any) {
  const wanted = normalizeCourt(courtParam);
  if (!wanted) return null;
  const candidates = await prisma.match.findMany({
    where: { status: { in: statuses as any }, court: { not: null } },
    orderBy,
    select: { id: true, court: true, status: true, updatedAt: true, matchNumber: true, homeTeamName: true, awayTeamName: true, startedAt: true, scheduledAt: true },
    take: 200,
  });
  return candidates.find((m) => normalizeCourt(m.court) === wanted) || null;
}

export async function setCourtOnAir(courtParam: string, matchId: string | null) {
  const key = normalizeCourt(courtParam);
  if (!key) return null;
  const courtLabel = String(courtParam || '').trim() || key;
  if (matchId) {
    const match = await prisma.match.findUnique({ where: { id: matchId }, select: { id: true, court: true } });
    if (!match) return null;
  }
  try {
    const rec = await (prisma as any).courtOnAir.upsert({
      where: { courtKey: key },
      create: { courtKey: key, courtLabel, matchId },
      update: { courtLabel, matchId },
      include: { match: { select: { id: true, status: true, matchNumber: true, homeTeamName: true, awayTeamName: true, court: true } } },
    });
    try {
      broadcastCourtActiveChanged(courtLabel, { court: courtLabel, courtKey: key, matchId: rec?.matchId || null, status: rec?.match?.status || null, match: rec?.match || null });
    } catch {}
    return rec;
  } catch {
    // Table may be missing when migrations haven't been applied yet.
    return null;
  }
}

export async function getCourtOnAir(courtParam: string) {
  const key = normalizeCourt(courtParam);
  if (!key) return null;
  return await (prisma as any).courtOnAir.findUnique({
    where: { courtKey: key },
    include: { match: { select: { id: true, status: true, matchNumber: true, homeTeamName: true, awayTeamName: true, court: true } } },
  }).catch(() => null);
}

/**
 * Resolve the match an output should follow on a court.
 *
 * Resolution order: explicit on-air assignment, in play, pre-match, latest completed.
 * Court matching is normalized ("1", "Court 1", "court-1" are equal).
 */
export class CourtController {
  static async activeMatch(req: Request, res: Response, next: NextFunction) {
    try {
      const court = String(req.params.court || '').trim();
      if (!court) return void res.status(400).json({ success: false, error: { message: 'court is required' }, timestamp: new Date().toISOString() });

      const key = normalizeCourt(court);
      const onAir = key ? await getCourtOnAir(court) : null;
      let match: any = null;
      let source: 'on_air' | 'in_play' | 'pre_match' | 'completed' | 'none' = 'none';

      if (onAir?.matchId && onAir.match) {
        match = onAir.match;
        source = 'on_air';
      }

      if (!match) {
        match = await findMatchForCourt(court, IN_PLAY, [{ startedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }]);
        if (match) source = 'in_play';
      }
      if (!match) {
        match = await findMatchForCourt(court, PRE_MATCH, [{ scheduledAt: 'asc' }, { createdAt: 'asc' }]);
        if (match) source = 'pre_match';
      }
      if (!match) {
        match = await findMatchForCourt(court, ['COMPLETED'], [{ endedAt: 'desc' }, { updatedAt: 'desc' }]);
        if (match) source = 'completed';
      }

      return void res.json({
        success: true,
        data: {
          court,
          courtKey: key,
          matchId: match?.id || null,
          status: match?.status || null,
          source,
          onAirMatchId: onAir?.matchId || null,
          match: match ? { id: match.id, status: match.status, matchNumber: match.matchNumber, homeTeamName: match.homeTeamName, awayTeamName: match.awayTeamName } : null,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (e) { next(e); }
  }

  static async setActive(req: Request, res: Response, next: NextFunction) {
    try {
      const court = String(req.params.court || '').trim();
      const matchId = req.body?.matchId ? String(req.body.matchId) : null;
      if (!court) return void res.status(400).json({ success: false, error: { message: 'court is required' }, timestamp: new Date().toISOString() });
      const key = normalizeCourt(court);
      if (!key) return void res.status(400).json({ success: false, error: { message: 'invalid court' }, timestamp: new Date().toISOString() });
      if (matchId) {
        const match = await prisma.match.findUnique({ where: { id: matchId }, select: { id: true } });
        if (!match) return void res.status(404).json({ success: false, error: { message: 'Match not found' }, timestamp: new Date().toISOString() });
      }
      const rec = await setCourtOnAir(court, matchId);
      return void res.json({ success: true, data: { court, courtKey: key, matchId: rec?.matchId || null }, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  }
}

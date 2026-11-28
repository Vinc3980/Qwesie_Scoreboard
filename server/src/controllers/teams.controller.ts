import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { parseBulkPlayerRows } from '@qwesie/shared';
import { deleteStoredKeys, shapePlayerMedia, shapeTeamMedia } from '../utils/media.js';

const ok = (res: Response, data: any, message?: string) => res.json({ success: true, data, message, timestamp: new Date().toISOString() });

const TEAM_FIELDS = [
  'name', 'shortName', 'code', 'city', 'country', 'logoUrl', 'logoKey', 'logoThumbKey',
  'coachName', 'coachPhotoKey', 'coachPhotoThumbKey', 'assistantCoachName', 'managerName',
  'teamPhotoKey', 'teamPhotoThumbKey', 'primaryColor', 'secondaryColor', 'textColor',
] as const;

function pickTeamData(body: any) {
  const b = body || {};
  const data: any = {};
  for (const k of TEAM_FIELDS) if (b[k] !== undefined) data[k] = b[k] === '' ? null : b[k];
  if (typeof data.name === 'string') data.name = data.name.trim();
  if (typeof data.shortName === 'string') data.shortName = data.shortName.trim().toUpperCase().slice(0, 4);
  if (typeof data.code === 'string') data.code = data.code.trim();
  return data;
}

function shapeTeam(team: any) {
  const t = shapeTeamMedia(team);
  if (t && Array.isArray(t.players)) t.players = t.players.map(shapePlayerMedia);
  return t;
}

export class TeamsController {
  static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.team.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { players: true } } } });
      ok(res, rows.map(shapeTeam));
    } catch (e) { next(e); }
  }

  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const team = await prisma.team.findUnique({
        where: { id: req.params.id },
        include: { players: { orderBy: [{ jerseyNumber: 'asc' }, { lastName: 'asc' }] } },
      });
      ok(res, shapeTeam(team));
    } catch (e) { next(e); }
  }

  static async players(req: Request, res: Response, next: NextFunction) {
    try {
      const players = await prisma.player.findMany({ where: { teamId: req.params.id }, orderBy: [{ jerseyNumber: 'asc' }, { lastName: 'asc' }] });
      ok(res, players.map(shapePlayerMedia));
    } catch (e) { next(e); }
  }

  static async bulkPlayers(req: Request, res: Response, next: NextFunction) {
    try {
      const teamId = req.params.id;
      const text = String(req.body?.text || '');
      const dryRun = !!req.body?.dryRun;
      const parsed = parseBulkPlayerRows(text);
      const rows = parsed.rows;
      const dup = new Map<number, number>();
      for (const r of rows) if (r.jerseyNumber) dup.set(r.jerseyNumber, (dup.get(r.jerseyNumber) || 0) + 1);
      for (const r of rows) if (r.jerseyNumber && (dup.get(r.jerseyNumber) || 0) > 1) { r.valid = false; r.errors.push('duplicate jersey in input'); }

      const jerseyNumbers = rows.filter(r => r.valid && r.jerseyNumber).map(r => r.jerseyNumber as number);
      const existing = jerseyNumbers.length ? await prisma.player.findMany({ where: { teamId, jerseyNumber: { in: jerseyNumbers } }, select: { jerseyNumber: true } }) : [];
      const existingSet = new Set(existing.map(e => e.jerseyNumber));
      for (const r of rows) if (r.valid && r.jerseyNumber && existingSet.has(r.jerseyNumber)) { r.valid = false; r.errors.push('jersey already exists in team'); }

      const valid = rows.filter(r => r.valid);
      let createdCount = 0;
      if (!dryRun && valid.length) {
        const data = valid.map(r => ({
          teamId,
          jerseyNumber: r.jerseyNumber!,
          firstName: r.name?.split(/\s+/)[0] || 'Player',
          lastName: r.name?.split(/\s+/).slice(1).join(' ') || String(r.jerseyNumber),
          displayName: r.name || String(r.jerseyNumber),
          position: r.position || null,
          isLibero: (r.position || '').toUpperCase() === 'L',
        }));
        const created = await prisma.player.createMany({ data, skipDuplicates: true });
        createdCount = created.count;
      }
      ok(res, { parsed: { ...parsed, rows }, createdCount, dryRun });
    } catch (e) { next(e); }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const b = req.body || {};
      const data = pickTeamData(b);
      if (!data.name) return res.status(400).json({ success: false, error: { message: 'Team name is required' }, timestamp: new Date().toISOString() });
      if (!data.shortName) data.shortName = data.name.slice(0, 4).toUpperCase();
      const team = await prisma.team.create({ data });
      ok(res, shapeTeam(team), 'Team created');
    } catch (e) { next(e); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.team.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ success: false, error: { message: 'Team not found' }, timestamp: new Date().toISOString() });
      const data = pickTeamData(req.body || {});
      const team = await prisma.team.update({ where: { id: req.params.id }, data });

      const removed: Array<string | null | undefined> = [];
      if (data.logoKey !== undefined && data.logoKey !== existing.logoKey) removed.push(existing.logoKey, existing.logoThumbKey);
      if (data.coachPhotoKey !== undefined && data.coachPhotoKey !== existing.coachPhotoKey) removed.push(existing.coachPhotoKey, existing.coachPhotoThumbKey);
      if (data.teamPhotoKey !== undefined && data.teamPhotoKey !== existing.teamPhotoKey) removed.push(existing.teamPhotoKey, existing.teamPhotoThumbKey);
      if (removed.length) await deleteStoredKeys(removed);

      ok(res, shapeTeam(team), 'Team updated');
    } catch (e) { next(e); }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.team.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ success: false, error: { message: 'Team not found' }, timestamp: new Date().toISOString() });
      await prisma.team.delete({ where: { id: req.params.id } });
      await deleteStoredKeys([existing.logoKey, existing.logoThumbKey, existing.coachPhotoKey, existing.coachPhotoThumbKey, existing.teamPhotoKey, existing.teamPhotoThumbKey]);
      ok(res, { id: req.params.id }, 'Team deleted');
    } catch (e) { next(e); }
  }
}

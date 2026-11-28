import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { deleteStoredKeys, shapePlayerMedia, shapeTeamMedia } from '../utils/media.js';

const ok = (res: Response, data: any, message?: string) => res.json({ success: true, data, message, timestamp: new Date().toISOString() });

const PLAYER_FIELDS = [
  'teamId', 'firstName', 'lastName', 'displayName', 'jerseyNumber', 'heightCm',
  'photoUrl', 'photoKey', 'thumbKey', 'position', 'isCaptain', 'isLibero',
] as const;

function pickPlayerData(body: any) {
  const b = body || {};
  const data: any = {};
  for (const k of PLAYER_FIELDS) if (b[k] !== undefined) data[k] = b[k] === '' ? null : b[k];
  if (data.jerseyNumber !== undefined && data.jerseyNumber !== null) data.jerseyNumber = Number(data.jerseyNumber);
  if (data.heightCm !== undefined && data.heightCm !== null) {
    const n = Number(data.heightCm);
    data.heightCm = Number.isFinite(n) ? Math.max(0, Math.min(300, Math.round(n))) : null;
  }
  if (typeof data.firstName === 'string') data.firstName = data.firstName.trim();
  if (typeof data.lastName === 'string') data.lastName = data.lastName.trim();
  if (typeof data.displayName === 'string') data.displayName = data.displayName.trim();
  return data;
}

function shapePlayer(player: any) {
  const p = shapePlayerMedia(player);
  if (p && p.team) p.team = shapeTeamMedia(p.team);
  return p;
}

export class PlayersController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;
      const players = await prisma.player.findMany({
        where: teamId ? { teamId } : undefined,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: { team: true },
      });
      ok(res, players.map(shapePlayer));
    } catch (e) { next(e); }
  }

  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const player = await prisma.player.findUnique({ where: { id: req.params.id }, include: { team: true } });
      ok(res, shapePlayer(player));
    } catch (e) { next(e); }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = pickPlayerData(req.body || {});
      const player = await prisma.player.create({
        data: {
          ...data,
          firstName: data.firstName || 'Player',
          lastName: data.lastName || 'Name',
          teamId: data.teamId || null,
        },
        include: { team: true },
      });
      ok(res, shapePlayer(player), 'Player created');
    } catch (e) { next(e); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.player.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ success: false, error: { message: 'Player not found' }, timestamp: new Date().toISOString() });
      const data = pickPlayerData(req.body || {});
      const player = await prisma.player.update({ where: { id: req.params.id }, data, include: { team: true } });
      if (data.photoKey !== undefined && data.photoKey !== existing.photoKey) {
        await deleteStoredKeys([existing.photoKey, existing.thumbKey]);
      }
      ok(res, shapePlayer(player), 'Player updated');
    } catch (e) { next(e); }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.player.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ success: false, error: { message: 'Player not found' }, timestamp: new Date().toISOString() });
      await prisma.player.delete({ where: { id: req.params.id } });
      await deleteStoredKeys([existing.photoKey, existing.thumbKey]);
      ok(res, { id: req.params.id }, 'Player deleted');
    } catch (e) { next(e); }
  }
}

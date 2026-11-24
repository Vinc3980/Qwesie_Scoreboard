import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';

const ok = (res: Response, data: any, message?: string) => res.json({ success: true, data, message, timestamp: new Date().toISOString() });

export class PlayersController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;
      ok(res, await prisma.player.findMany({ where: teamId ? { teamId } : undefined, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], include: { team: true } }));
    } catch (e) { next(e); }
  }
  static async get(req: Request, res: Response, next: NextFunction) {
    try { ok(res, await prisma.player.findUnique({ where: { id: req.params.id }, include: { team: true } })); } catch (e) { next(e); }
  }
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const b = req.body || {};
      const player = await prisma.player.create({ data: {
        teamId: b.teamId || null,
        firstName: String(b.firstName || b.name || '').trim().split(/\s+/)[0] || 'Player',
        lastName: String(b.lastName || (String(b.name || '').trim().split(/\s+/).slice(1).join(' ')) || '').trim() || 'Name',
        displayName: b.displayName || b.name || null,
        jerseyNumber: b.jerseyNumber != null ? Number(b.jerseyNumber) : null,
        photoUrl: b.photoUrl || null,
        position: b.position || null,
        isCaptain: !!b.isCaptain,
        isLibero: !!b.isLibero,
      }});
      ok(res, player, 'Player created');
    } catch (e) { next(e); }
  }
  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const b = req.body || {};
      const data: any = {};
      for (const k of ['teamId','firstName','lastName','displayName','photoUrl','position','isCaptain','isLibero']) if (b[k] !== undefined) data[k] = b[k];
      if (b.jerseyNumber !== undefined) data.jerseyNumber = b.jerseyNumber == null || b.jerseyNumber === '' ? null : Number(b.jerseyNumber);
      if (b.name && !b.firstName && !b.lastName) { const parts = String(b.name).trim().split(/\s+/); data.firstName = parts[0]; data.lastName = parts.slice(1).join(' ') || 'Name'; data.displayName = b.name; }
      const player = await prisma.player.update({ where: { id: req.params.id }, data });
      ok(res, player, 'Player updated');
    } catch (e) { next(e); }
  }
  static async remove(req: Request, res: Response, next: NextFunction) {
    try { await prisma.player.delete({ where: { id: req.params.id } }); ok(res, { id: req.params.id }, 'Player deleted'); } catch (e) { next(e); }
  }
}

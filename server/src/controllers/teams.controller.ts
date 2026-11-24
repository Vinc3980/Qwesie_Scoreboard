import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { parseBulkPlayerRows } from '@qwesie/shared';

const ok = (res: Response, data: any, message?: string) => res.json({ success: true, data, message, timestamp: new Date().toISOString() });

export class TeamsController {
  static async list(_req: Request, res: Response, next: NextFunction) {
    try { ok(res, await prisma.team.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { players: true } } } })); } catch (e) { next(e); }
  }
  static async get(req: Request, res: Response, next: NextFunction) {
    try { ok(res, await prisma.team.findUnique({ where: { id: req.params.id }, include: { players: { orderBy: [{ jerseyNumber: 'asc' }, { lastName: 'asc' }] } } })); } catch (e) { next(e); }
  }
  static async players(req: Request, res: Response, next: NextFunction) {
    try { ok(res, await prisma.player.findMany({ where: { teamId: req.params.id }, orderBy: [{ jerseyNumber: 'asc' }, { lastName: 'asc' }] })); } catch (e) { next(e); }
  }
  static async bulkPlayers(req: Request, res: Response, next: NextFunction) {
    try {
      const teamId = req.params.id;
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team) return void res.status(404).json({ success: false, error: { message: 'Team not found' }, timestamp: new Date().toISOString() });
      const text = String(req.body?.text ?? '');
      const dryRun = !!req.body?.dryRun;
      const parsed = parseBulkPlayerRows(text);
      if (dryRun) return void ok(res, parsed, 'Bulk parse dry-run');
      const created: any[] = [];
      const errors: any[] = [];
      for (const row of parsed.rows) {
        if (!row.valid) { errors.push({ raw: row.raw, errors: row.errors }); continue; }
        const parts = String(row.name || '').trim().split(/\s+/);
        const firstName = parts[0] || 'Player';
        const lastName = parts.slice(1).join(' ') || 'Name';
        try {
          const p = await prisma.player.create({ data: { teamId, firstName, lastName, displayName: row.name, jerseyNumber: row.jerseyNumber ?? null, position: row.position || null } });
          created.push(p);
        } catch (e: any) {
          errors.push({ raw: row.raw, errors: [e?.message || 'create failed'] });
        }
      }
      ok(res, { parsed, created, errors, createdCount: created.length, errorCount: errors.length + parsed.errorCount }, 'Bulk players processed');
    } catch (e) { next(e); }
  }
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const b = req.body || {};
      const team = await prisma.team.create({ data: {
        name: String(b.name || '').trim(),
        shortName: String(b.shortName || b.code || '').trim().slice(0,4).toUpperCase(),
        code: b.code || null, city: b.city || null, country: b.country || null,
        logoUrl: b.logoUrl || null, primaryColor: b.primaryColor || null, secondaryColor: b.secondaryColor || null, textColor: b.textColor || null,
      }});
      ok(res, team, 'Team created');
    } catch (e) { next(e); }
  }
  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const b = req.body || {};
      const data: any = {};
      for (const k of ['name','code','city','country','logoUrl','primaryColor','secondaryColor','textColor']) if (b[k] !== undefined) data[k] = b[k];
      if (b.shortName !== undefined) data.shortName = String(b.shortName).trim().slice(0,4).toUpperCase();
      const team = await prisma.team.update({ where: { id: req.params.id }, data });
      ok(res, team, 'Team updated');
    } catch (e) { next(e); }
  }
  static async remove(req: Request, res: Response, next: NextFunction) {
    try { await prisma.team.delete({ where: { id: req.params.id } }); ok(res, { id: req.params.id }, 'Team deleted'); } catch (e) { next(e); }
  }
}

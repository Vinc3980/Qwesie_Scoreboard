import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
const ok = (res: Response, data: any, message?: string) => res.json({ success: true, data, message, timestamp: new Date().toISOString() });

export class CompetitionsController {
  static async list(_req: Request, res: Response, next: NextFunction) { try { ok(res, await prisma.competition.findMany({ orderBy: { createdAt: 'desc' }, include: { tournaments: true, _count: { select: { matches: true } } } })); } catch(e){next(e);} }
  static async get(req: Request, res: Response, next: NextFunction) { try { ok(res, await prisma.competition.findUnique({ where: { id: req.params.id }, include: { tournaments: true } })); } catch(e){next(e);} }
  static async create(req: Request, res: Response, next: NextFunction) { try { const b=req.body||{}; ok(res, await prisma.competition.create({ data:{ name:String(b.name||'Competition'), season:b.season||null, organizer:b.organizer||null, description:b.description||null } }), 'Competition created'); } catch(e){next(e);} }
  static async update(req: Request, res: Response, next: NextFunction) { try { const b=req.body||{}; const data:any={}; for(const k of ['name','season','organizer','description']) if(b[k]!==undefined) data[k]=b[k]; ok(res, await prisma.competition.update({ where:{id:req.params.id}, data }), 'Competition updated'); } catch(e){next(e);} }
  static async remove(req: Request, res: Response, next: NextFunction) { try { await prisma.competition.delete({ where:{id:req.params.id} }); ok(res,{id:req.params.id},'Competition deleted'); } catch(e){next(e);} }
}

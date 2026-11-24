import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
const ok = (res: Response, data: any, message?: string) => res.json({ success: true, data, message, timestamp: new Date().toISOString() });

export class TournamentsController {
  static async list(req: Request, res: Response, next: NextFunction) { try { const competitionId = typeof req.query.competitionId === 'string' ? req.query.competitionId : undefined; ok(res, await prisma.tournament.findMany({ where: competitionId?{competitionId}:undefined, orderBy: { createdAt: 'desc' }, include: { competition: true } })); } catch(e){next(e);} }
  static async get(req: Request, res: Response, next: NextFunction) { try { ok(res, await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { competition: true } })); } catch(e){next(e);} }
  static async create(req: Request, res: Response, next: NextFunction) { try { const b=req.body||{}; ok(res, await prisma.tournament.create({ data:{ name:String(b.name||'Tournament'), competitionId:b.competitionId||null, location:b.location||null, startDate:b.startDate?new Date(b.startDate):null, endDate:b.endDate?new Date(b.endDate):null } }), 'Tournament created'); } catch(e){next(e);} }
  static async update(req: Request, res: Response, next: NextFunction) { try { const b=req.body||{}; const data:any={}; for(const k of ['name','competitionId','location']) if(b[k]!==undefined) data[k]=b[k]; if(b.startDate!==undefined) data.startDate=b.startDate?new Date(b.startDate):null; if(b.endDate!==undefined) data.endDate=b.endDate?new Date(b.endDate):null; ok(res, await prisma.tournament.update({ where:{id:req.params.id}, data }), 'Tournament updated'); } catch(e){next(e);} }
  static async remove(req: Request, res: Response, next: NextFunction) { try { await prisma.tournament.delete({ where:{id:req.params.id} }); ok(res,{id:req.params.id},'Tournament deleted'); } catch(e){next(e);} }
}

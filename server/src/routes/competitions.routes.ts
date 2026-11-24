import { Router } from 'express';
import { CompetitionsController } from '../controllers/competitions.controller.js';
import { requireRoles } from '../middleware/auth.js';

export const competitionsRouter = Router();
const scorer = requireRoles(['ADMIN','SCORER']);

competitionsRouter.get('/', CompetitionsController.list);
competitionsRouter.get('/:id', CompetitionsController.get);
competitionsRouter.post('/', scorer, CompetitionsController.create);
competitionsRouter.put('/:id', scorer, CompetitionsController.update);
competitionsRouter.delete('/:id', requireRoles(['ADMIN']), CompetitionsController.remove);

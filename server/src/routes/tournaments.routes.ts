import { Router } from 'express';
import { TournamentsController } from '../controllers/tournaments.controller.js';
import { requireRoles } from '../middleware/auth.js';

export const tournamentsRouter = Router();
const scorer = requireRoles(['ADMIN','SCORER']);

tournamentsRouter.get('/', TournamentsController.list);
tournamentsRouter.get('/:id', TournamentsController.get);
tournamentsRouter.post('/', scorer, TournamentsController.create);
tournamentsRouter.put('/:id', scorer, TournamentsController.update);
tournamentsRouter.delete('/:id', requireRoles(['ADMIN']), TournamentsController.remove);

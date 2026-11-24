import { Router } from 'express';
import { PlayersController } from '../controllers/players.controller.js';
import { requireRoles } from '../middleware/auth.js';

export const playersRouter = Router();
const scorer = requireRoles(['ADMIN','SCORER']);

playersRouter.get('/', PlayersController.list);
playersRouter.get('/:id', PlayersController.get);
playersRouter.post('/', scorer, PlayersController.create);
playersRouter.put('/:id', scorer, PlayersController.update);
playersRouter.delete('/:id', requireRoles(['ADMIN']), PlayersController.remove);

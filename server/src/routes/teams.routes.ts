import { Router } from 'express';
import { TeamsController } from '../controllers/teams.controller.js';
import { requireRoles } from '../middleware/auth.js';

export const teamsRouter = Router();
const scorer = requireRoles(['ADMIN','SCORER']);

teamsRouter.get('/', TeamsController.list);
teamsRouter.get('/:id', TeamsController.get);
teamsRouter.post('/', scorer, TeamsController.create);
teamsRouter.put('/:id', scorer, TeamsController.update);
teamsRouter.delete('/:id', requireRoles(['ADMIN']), TeamsController.remove);
teamsRouter.get('/:id/players', TeamsController.players);
teamsRouter.post('/:id/players/bulk', scorer, TeamsController.bulkPlayers);

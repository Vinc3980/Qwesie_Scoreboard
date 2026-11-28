import { Router } from 'express';
import { CompetitionsController } from '../controllers/competitions.controller.js';
import { requireRoles } from '../middleware/auth.js';

export const competitionsRouter = Router();
export const publicCompetitionsRouter = Router();
const scorer = requireRoles(['ADMIN','SCORER']);

competitionsRouter.get('/', CompetitionsController.list);
competitionsRouter.get('/:id', CompetitionsController.get);
competitionsRouter.get('/:id/standings', CompetitionsController.standings);
competitionsRouter.get('/:id/fixtures', CompetitionsController.fixtures);
competitionsRouter.get('/:id/divisions', CompetitionsController.divisions);
competitionsRouter.post('/:id/fixtures/generate-preview', scorer, CompetitionsController.generateFixturesPreview);
competitionsRouter.post('/:id/fixtures/generate-commit', scorer, CompetitionsController.commitFixtures);
competitionsRouter.post('/', scorer, CompetitionsController.create);
competitionsRouter.put('/:id', scorer, CompetitionsController.update);
competitionsRouter.delete('/:id', requireRoles(['ADMIN']), CompetitionsController.remove);

publicCompetitionsRouter.get('/:id', CompetitionsController.get);
publicCompetitionsRouter.get('/:id/standings', CompetitionsController.standings);
publicCompetitionsRouter.get('/:id/fixtures', CompetitionsController.fixtures);
publicCompetitionsRouter.get('/:id/divisions', CompetitionsController.divisions);

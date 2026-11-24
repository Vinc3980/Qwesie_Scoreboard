import { Router } from 'express';
import { ScorebugThemeController } from '../controllers/scorebugTheme.controller.js';
import { requireRoles } from '../middleware/auth.js';

export const scorebugThemeRouter = Router();
const scorer = requireRoles(['ADMIN', 'SCORER']);
const admin = requireRoles(['ADMIN']);

scorebugThemeRouter.get('/', scorer, ScorebugThemeController.list);
scorebugThemeRouter.get('/match/:matchId/resolved', scorer, ScorebugThemeController.resolveForMatch);
scorebugThemeRouter.get('/:id', scorer, ScorebugThemeController.get);
scorebugThemeRouter.post('/', admin, ScorebugThemeController.create);
scorebugThemeRouter.put('/:id', admin, ScorebugThemeController.update);
scorebugThemeRouter.delete('/:id', admin, ScorebugThemeController.remove);
scorebugThemeRouter.post('/:id/duplicate', admin, ScorebugThemeController.duplicate);
scorebugThemeRouter.post('/:id/default', admin, ScorebugThemeController.setDefault);
scorebugThemeRouter.post('/match/:matchId/apply', scorer, ScorebugThemeController.applyToMatch);
scorebugThemeRouter.post('/competition/:competitionId/apply', scorer, ScorebugThemeController.applyToCompetition);

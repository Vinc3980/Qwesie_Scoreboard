import { Router } from 'express';
import { MatchController } from '../controllers/match.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import {
  pointMutationSchema,
  actionMutationSchema,
  timeoutMutationSchema,
  substitutionMutationSchema,
  matchSetupSchema,
  matchInfoSchema,
  undoMutationSchema,
  rosterReplaceSchema,
  lineupSetSchema,
  startSetSchema,
} from '@qwesie/shared';

export const matchRouter = Router();
const scorer = requireRoles(['ADMIN', 'SCORER']);

// Match query routes: operator/console reads require auth; GET /:id remains public for overlay outputs.
matchRouter.get('/', requireAuth, MatchController.listMatches);
matchRouter.get('/history/analytics', requireAuth, MatchController.getHistory);
matchRouter.get('/current', requireAuth, MatchController.getCurrentMatch);
matchRouter.get('/active', requireAuth, MatchController.getActiveMatch);
matchRouter.get('/current/analytics', requireAuth, MatchController.getAnalytics);
matchRouter.get('/current/report', requireAuth, MatchController.getReport);
matchRouter.get('/:id/readiness', requireAuth, MatchController.getReadiness);
matchRouter.get('/:id/roster/:side', requireAuth, MatchController.getRoster);
matchRouter.get('/:id/analytics', requireAuth, MatchController.getAnalytics);
matchRouter.get('/:id/report', requireAuth, MatchController.getReport);
matchRouter.get('/:id', MatchController.getMatchById);

// Mutations (ADMIN/SCORER)
matchRouter.post('/', scorer, validate(matchSetupSchema), MatchController.createMatch);
matchRouter.post('/archive-tests', scorer, MatchController.archiveTestMatches);
matchRouter.post('/:id/go-live', scorer, MatchController.goLive);
matchRouter.post('/:id/reset', scorer, MatchController.resetMatch);
matchRouter.put('/:id/roster/:side', scorer, validate(rosterReplaceSchema), MatchController.putRoster);
matchRouter.post('/:id/roster/:side/copy-from/:otherMatchId', scorer, MatchController.copyRoster);
matchRouter.put('/:id/lineup/:side/:setNumber', scorer, validate(lineupSetSchema), MatchController.putLineup);
matchRouter.post('/:id/point', scorer, validate(pointMutationSchema), MatchController.point);
matchRouter.post('/:id/action', scorer, validate(actionMutationSchema), MatchController.action);
matchRouter.post('/:id/timeout', scorer, validate(timeoutMutationSchema), MatchController.timeout);
matchRouter.post('/:id/substitution', scorer, validate(substitutionMutationSchema), MatchController.substitution);
matchRouter.post('/:id/start-set', scorer, validate(startSetSchema), MatchController.startSet);
matchRouter.post('/:id/end-set', scorer, MatchController.endSet);
matchRouter.post('/:id/setup', scorer, validate(matchSetupSchema), MatchController.setup);
matchRouter.post('/:id/info', scorer, validate(matchInfoSchema), MatchController.info);
matchRouter.post('/:id/status', scorer, MatchController.setStatus);
matchRouter.post('/:id/undo', scorer, validate(undoMutationSchema), MatchController.undo);

// Default match mutation routes (for active current match)
matchRouter.post('/point', scorer, validate(pointMutationSchema), MatchController.point);
matchRouter.post('/action', scorer, validate(actionMutationSchema), MatchController.action);
matchRouter.post('/timeout', scorer, validate(timeoutMutationSchema), MatchController.timeout);
matchRouter.post('/substitution', scorer, validate(substitutionMutationSchema), MatchController.substitution);
matchRouter.post('/start-set', scorer, validate(startSetSchema), MatchController.startSet);
matchRouter.post('/end-set', scorer, MatchController.endSet);
matchRouter.post('/setup', scorer, validate(matchSetupSchema), MatchController.setup);
matchRouter.post('/info', scorer, validate(matchInfoSchema), MatchController.info);
matchRouter.post('/status', scorer, MatchController.setStatus);
matchRouter.post('/undo', scorer, validate(undoMutationSchema), MatchController.undo);

import { Router } from 'express';
import { BroadcastController } from '../controllers/broadcast.controller.js';
import { requireRoles } from '../middleware/auth.js';

export const broadcastRouter = Router();
const scorer = requireRoles(['ADMIN', 'SCORER']);

// Public reads for overlay outputs (scene/graphic state) and template catalog
broadcastRouter.get('/templates', BroadcastController.templates);
broadcastRouter.get('/:matchId/graphic', BroadcastController.getState);
broadcastRouter.get('/:matchId/scene', BroadcastController.getScene);
// Preview is console/operator planning state (not needed by on-air outputs)
broadcastRouter.get('/:matchId/preview', scorer, BroadcastController.getPreview);

// Mutations (wrappers + preview/program)
broadcastRouter.post('/:matchId/graphic', scorer, BroadcastController.setState);
broadcastRouter.post('/:matchId/graphic/dismiss', scorer, BroadcastController.dismiss);
broadcastRouter.post('/:matchId/break/start', scorer, BroadcastController.startBreak);
broadcastRouter.post('/:matchId/break/end', scorer, BroadcastController.endBreak);
broadcastRouter.post('/:matchId/resume', scorer, BroadcastController.resume);
broadcastRouter.post('/:matchId/scene', scorer, BroadcastController.setScene);
broadcastRouter.post('/:matchId/scene/auto-triggers', scorer, BroadcastController.setAutoTriggers);
broadcastRouter.post('/:matchId/preview', scorer, BroadcastController.setPreview);
broadcastRouter.post('/:matchId/take', scorer, BroadcastController.take);
broadcastRouter.post('/:matchId/clear', scorer, BroadcastController.clear);

// Intro sequence runner (server-timed)
broadcastRouter.get('/:matchId/sequence', scorer, BroadcastController.getSequence);
broadcastRouter.put('/:matchId/sequence', scorer, BroadcastController.updateSequence);
broadcastRouter.post('/:matchId/sequence/start', scorer, BroadcastController.startSequence);
broadcastRouter.post('/:matchId/sequence/control', scorer, BroadcastController.controlSequence);

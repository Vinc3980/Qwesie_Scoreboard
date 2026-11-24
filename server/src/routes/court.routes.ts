import { Router } from 'express';
import { CourtController } from '../controllers/court.controller.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';

export const courtRouter = Router();
courtRouter.get('/:court/active', CourtController.activeMatch);
courtRouter.post('/:court/active', requireAuth, requireRoles(['ADMIN', 'SCORER']), CourtController.setActive);

import { Router } from 'express';
import { SystemController } from '../controllers/system.controller.js';

export const systemRouter = Router();
systemRouter.get('/info', SystemController.info);

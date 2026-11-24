import { Router } from 'express';
import { UploadsController, uploadMiddleware } from '../controllers/uploads.controller.js';
import { requireRoles } from '../middleware/auth.js';

export const uploadsRouter = Router();
uploadsRouter.post('/', requireRoles(['ADMIN','SCORER']), uploadMiddleware, UploadsController.upload);

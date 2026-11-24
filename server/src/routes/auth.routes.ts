import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import {
  loginSchema, bootstrapSchema, createUserSchema, changePasswordSchema,
  adminUpdateUserSchema, forgotPasswordRequestSchema, resetPasswordWithCodeSchema,
  resetPasswordWithTokenSchema, consumeTempPasswordSchema,
} from '@qwesie/shared';
import { requireAuth, requireRoles } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.get('/bootstrap-status', AuthController.bootstrapStatus);
authRouter.post('/bootstrap', validate(bootstrapSchema), AuthController.bootstrap);
authRouter.post('/login', validate(loginSchema), AuthController.login);
authRouter.post('/logout', AuthController.logout);
authRouter.post('/logout-all', requireAuth, AuthController.logoutAll);
authRouter.get('/me', requireAuth, AuthController.me);
authRouter.post('/change-password', requireAuth, validate(changePasswordSchema), AuthController.changePassword);
authRouter.get('/smtp-status', AuthController.smtpStatus);

// Forgot/reset (public, generic responses, rate limited in controller)
authRouter.post('/forgot-password', validate(forgotPasswordRequestSchema), AuthController.forgotPasswordRequest);
authRouter.post('/reset-password/recovery-code', validate(resetPasswordWithCodeSchema), AuthController.resetWithRecoveryCode);
authRouter.post('/reset-password/token', validate(resetPasswordWithTokenSchema), AuthController.resetWithToken);
authRouter.post('/reset-password/temp', validate(consumeTempPasswordSchema), AuthController.resetWithTempPassword);

// Admin user management
authRouter.get('/users', requireAuth, requireRoles(['ADMIN']), AuthController.listUsers);
authRouter.post('/users', requireAuth, requireRoles(['ADMIN']), validate(createUserSchema), AuthController.createUser);
authRouter.patch('/users/:id', requireAuth, requireRoles(['ADMIN']), validate(adminUpdateUserSchema), AuthController.updateUser);
authRouter.post('/users/:id/reset-password', requireAuth, requireRoles(['ADMIN']), AuthController.resetPassword);
authRouter.delete('/users/:id', requireAuth, requireRoles(['ADMIN']), AuthController.deleteOrDisableUser); // soft-disable
authRouter.post('/recovery-codes/regenerate', requireAuth, requireRoles(['ADMIN']), AuthController.regenerateRecoveryCodes);


import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@qwesie/shared';
import { scorebugThemeConfigSchema } from '@qwesie/shared';
import * as svc from '../services/scorebugTheme.service.js';

function send(res: Response, data: any, message?: string) {
  const response: ApiResponse = { success: true, data, message, timestamp: new Date().toISOString() };
  res.json(response);
}

function bad(res: Response, message: string) {
  return res.status(400).json({ success: false, error: { message }, timestamp: new Date().toISOString() });
}

export class ScorebugThemeController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const competitionId = typeof req.query.competitionId === 'string' ? req.query.competitionId : undefined;
      const includeBuiltIns = req.query.includeBuiltIns !== 'false';
      send(res, await svc.listScorebugThemes({ competitionId, includeBuiltIns }));
    } catch (e) { next(e); }
  }

  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const theme = await svc.getScorebugThemeById(req.params.id);
      if (!theme) return res.status(404).json({ success: false, error: { message: 'Theme not found' }, timestamp: new Date().toISOString() });
      send(res, theme);
    } catch (e) { next(e); }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body || {};
      if (!body.name || !String(body.name).trim()) return bad(res, 'name is required');
      if (body.config !== undefined) scorebugThemeConfigSchema.parse(body.config);
      const theme = await svc.createScorebugTheme({
        name: String(body.name),
        description: body.description ?? null,
        config: body.config,
        competitionId: body.competitionId ?? null,
        isDefault: !!body.isDefault,
      });
      send(res, theme, 'Theme created');
    } catch (e) { next(e); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body || {};
      if (body.config !== undefined) scorebugThemeConfigSchema.parse(body.config);
      const theme = await svc.updateScorebugTheme(req.params.id, body);
      send(res, theme, 'Theme updated');
    } catch (e) { next(e); }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      send(res, await svc.deleteScorebugTheme(req.params.id), 'Theme deleted');
    } catch (e) { next(e); }
  }

  static async duplicate(req: Request, res: Response, next: NextFunction) {
    try {
      const theme = await svc.duplicateScorebugTheme(req.params.id, { name: req.body?.name });
      send(res, theme, 'Theme duplicated');
    } catch (e) { next(e); }
  }

  static async setDefault(req: Request, res: Response, next: NextFunction) {
    try {
      send(res, await svc.setDefaultScorebugTheme(req.params.id), 'Default theme updated');
    } catch (e) { next(e); }
  }

  static async applyToMatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const themeId = req.body?.themeId ?? null;
      const result = await svc.applyScorebugThemeToMatch(matchId, themeId ? String(themeId) : null);
      send(res, result, 'Theme applied to match');
    } catch (e) { next(e); }
  }

  static async applyToCompetition(req: Request, res: Response, next: NextFunction) {
    try {
      const { competitionId } = req.params;
      const themeId = req.body?.themeId ?? null;
      const result = await svc.applyScorebugThemeToCompetition(competitionId, themeId ? String(themeId) : null);
      send(res, result, 'Theme applied to competition');
    } catch (e) { next(e); }
  }

  static async resolveForMatch(req: Request, res: Response, next: NextFunction) {
    try {
      send(res, await svc.getResolvedScorebugThemeForMatch(req.params.matchId));
    } catch (e) { next(e); }
  }
}

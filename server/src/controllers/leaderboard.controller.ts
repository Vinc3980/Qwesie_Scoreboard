import { Request, Response, NextFunction } from 'express';
import { listLeaderboardThemes, getLeaderboardTheme, createLeaderboardTheme, updateLeaderboardTheme, deleteLeaderboardTheme, resolveLeaderboardTheme, duplicateLeaderboardTheme, setDefaultLeaderboardTheme } from '../services/leaderboardTheme.service.js';
import { getPlayerLeaderboard } from '../services/playerLeaderboard.service.js';
import { getCompetitionStandings } from '../services/standings.service.js';
import { prisma } from '../config/database.js';
import { setActiveGraphicState } from '../services/broadcast.service.js';

const ok = (res: Response, data: any, message?: string) => res.json({ success: true, data, message, timestamp: new Date().toISOString() });
const bad = (res: Response, status: number, message: string) => res.status(status).json({ success: false, error: { message }, timestamp: new Date().toISOString() });

export class LeaderboardController {
  static async listThemes(req: Request, res: Response, next: NextFunction) { try { ok(res, await listLeaderboardThemes(req.query.competitionId ? String(req.query.competitionId) : undefined)); } catch(e){next(e);} }
  static async getTheme(req: Request, res: Response, next: NextFunction) { try { const t = await getLeaderboardTheme(req.params.id); if (!t) return bad(res,404,'Not found'); ok(res, t); } catch(e){next(e);} }
  static async createTheme(req: Request, res: Response, next: NextFunction) { try { ok(res, await createLeaderboardTheme(req.body||{}), 'Theme created'); } catch(e){next(e);} }
  static async updateTheme(req: Request, res: Response, next: NextFunction) { try { const t = await updateLeaderboardTheme(req.params.id, req.body||{}); if (!t) return bad(res,404,'Not found'); ok(res, t, 'Theme updated'); } catch(e){next(e);} }
  static async deleteTheme(req: Request, res: Response, next: NextFunction) { try { ok(res, { deleted: await deleteLeaderboardTheme(req.params.id) }, 'Theme deleted'); } catch(e){next(e);} }
  static async duplicateTheme(req: Request, res: Response, next: NextFunction) { try { const t = await duplicateLeaderboardTheme(req.params.id, req.body?.name ? String(req.body.name) : undefined); if (!t) return bad(res,404,'Not found'); ok(res, t, 'Theme duplicated'); } catch(e){next(e);} }
  static async resolveTheme(req: Request, res: Response, next: NextFunction) { try { ok(res, await resolveLeaderboardTheme({ competitionId: req.query.competitionId ? String(req.query.competitionId) : null, themeId: req.query.themeId ? String(req.query.themeId) : null, kind: req.query.kind === 'player' ? 'player' : 'leaderboard' })); } catch(e){next(e);} }

  static async setDefault(req: Request, res: Response, next: NextFunction) {
    try {
      const competitionId = req.body?.competitionId ? String(req.body.competitionId) : (req.query.competitionId ? String(req.query.competitionId) : null);
      const t = await setDefaultLeaderboardTheme(req.params.id, competitionId);
      if (!t) return bad(res,404,'Not found');
      if (competitionId && !t.isBuiltIn) {
        await prisma.competition.update({ where: { id: competitionId }, data: { leaderboardThemeId: t.id } as any });
      }
      ok(res, t, 'Default theme updated');
    } catch(e){next(e);}
  }

  static async applyToCompetition(req: Request, res: Response, next: NextFunction) {
    try {
      const { competitionId } = req.params;
      const themeId = req.body?.themeId ? String(req.body.themeId) : req.params.id;
      const theme = await getLeaderboardTheme(themeId);
      if (!theme) return bad(res,404,'Theme not found');
      // For builtins, ensure a DB row exists so FK can be set
      let dbId = theme.id;
      if (theme.isBuiltIn) {
        const existing = await prisma.leaderboardTheme.findFirst({ where: { name: theme.name, isBuiltIn: true, kind: theme.kind } as any });
        if (existing) dbId = existing.id;
        else {
          const created = await prisma.leaderboardTheme.create({ data: { name: theme.name, description: theme.description || null, kind: theme.kind, config: theme.config as any, isBuiltIn: true, isDefault: false } as any });
          dbId = created.id;
        }
      }
      await prisma.competition.update({ where: { id: competitionId }, data: { leaderboardThemeId: dbId } as any });
      ok(res, { competitionId, themeId: dbId }, 'Leaderboard theme applied to competition');
    } catch(e){next(e);}
  }

  static async applyToOnAir(req: Request, res: Response, next: NextFunction) {
    try {
      const matchId = String(req.body?.matchId || req.query.matchId || '');
      if (!matchId) return bad(res,400,'matchId is required');
      const themeId = req.params.id;
      const theme = await getLeaderboardTheme(themeId);
      if (!theme) return bad(res,404,'Theme not found');
      const template = String(req.body?.template || 'LEADERBOARD');
      const payload = { ...(req.body?.payload || {}), themeId: theme.id, leaderboardTheme: theme.config, leaderboardThemeName: theme.name };
      const state = await setActiveGraphicState(matchId, { template, visible: true, payload, durationSeconds: req.body?.durationSeconds ?? null });
      ok(res, { state, theme }, 'Leaderboard theme applied on air');
    } catch(e){next(e);}
  }

  static async exportTheme(req: Request, res: Response, next: NextFunction) {
    try {
      const t = await getLeaderboardTheme(req.params.id);
      if (!t) return bad(res,404,'Not found');
      ok(res, { version: 1, kind: t.kind, name: t.name, description: t.description ?? null, config: t.config });
    } catch(e){next(e);}
  }

  static async importTheme(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body || {};
      const cfg = body.config || body;
      const created = await createLeaderboardTheme({ name: body.name || 'Imported Leaderboard Theme', description: body.description || null, kind: body.kind || 'leaderboard', config: cfg, competitionId: body.competitionId || null });
      ok(res, created, 'Theme imported');
    } catch(e){next(e);}
  }

  static async playerLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const competitionId = String(req.params.competitionId || req.query.competitionId || '');
      if (!competitionId) return bad(res,400,'competitionId required');
      const data = await getPlayerLeaderboard({
        competitionId,
        category: (String(req.query.category || 'points') as any),
        division: req.query.division ? String(req.query.division) : null,
        group: req.query.group ? String(req.query.group) : null,
        teamId: req.query.teamId ? String(req.query.teamId) : null,
        from: req.query.from ? new Date(String(req.query.from)) : null,
        to: req.query.to ? new Date(String(req.query.to)) : null,
        minMatches: req.query.minMatches ? Number(req.query.minMatches) : 1,
        provisional: req.query.provisional === 'true',
        limit: req.query.limit ? Number(req.query.limit) : 20,
      });
      ok(res, data);
    } catch(e){next(e);}
  }

  static async combined(req: Request, res: Response, next: NextFunction) {
    try {
      const competitionId = String(req.params.competitionId || '');
      const division = req.query.division ? String(req.query.division) : undefined;
      const standings = await getCompetitionStandings(competitionId, { division });
      const cats = ['points','aces','blocks','kills'] as const;
      const leaders: any = {};
      for (const c of cats) leaders[c] = await getPlayerLeaderboard({ competitionId, category: c as any, division: division || null, limit: 5 });
      ok(res, { standings, leaders, generatedAt: new Date().toISOString() });
    } catch(e){next(e);}
  }
}

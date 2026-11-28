import { Router } from 'express';
import { LeaderboardController } from '../controllers/leaderboard.controller.js';
import { requireRoles } from '../middleware/auth.js';

export const leaderboardRouter = Router();
export const publicLeaderboardRouter = Router();
const scorer = requireRoles(['ADMIN','SCORER']);

leaderboardRouter.get('/themes', LeaderboardController.listThemes);
leaderboardRouter.get('/themes/resolve', LeaderboardController.resolveTheme);
leaderboardRouter.post('/themes/import', scorer, LeaderboardController.importTheme);
leaderboardRouter.get('/themes/:id/export', LeaderboardController.exportTheme);
leaderboardRouter.post('/themes/:id/duplicate', scorer, LeaderboardController.duplicateTheme);
leaderboardRouter.post('/themes/:id/default', scorer, LeaderboardController.setDefault);
leaderboardRouter.post('/themes/:id/apply-on-air', scorer, LeaderboardController.applyToOnAir);
leaderboardRouter.post('/themes/:id/apply-competition/:competitionId', scorer, LeaderboardController.applyToCompetition);
leaderboardRouter.get('/themes/:id', LeaderboardController.getTheme);
leaderboardRouter.post('/themes', scorer, LeaderboardController.createTheme);
leaderboardRouter.put('/themes/:id', scorer, LeaderboardController.updateTheme);
leaderboardRouter.delete('/themes/:id', scorer, LeaderboardController.deleteTheme);
leaderboardRouter.get('/competition/:competitionId/players', LeaderboardController.playerLeaderboard);
leaderboardRouter.get('/competition/:competitionId/combined', LeaderboardController.combined);

publicLeaderboardRouter.get('/themes', LeaderboardController.listThemes);
publicLeaderboardRouter.get('/themes/resolve', LeaderboardController.resolveTheme);
publicLeaderboardRouter.get('/themes/:id', LeaderboardController.getTheme);
publicLeaderboardRouter.get('/themes/:id/export', LeaderboardController.exportTheme);
publicLeaderboardRouter.get('/competition/:competitionId/players', LeaderboardController.playerLeaderboard);
publicLeaderboardRouter.get('/competition/:competitionId/combined', LeaderboardController.combined);

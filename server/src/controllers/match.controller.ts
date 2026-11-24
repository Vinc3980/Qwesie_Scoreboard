import { Request, Response, NextFunction } from 'express';
import { MatchService } from '../services/match.service.js';
import { ApiResponse, MatchStatus } from '@qwesie/shared';

function sendState(res: Response, state: any, message?: string) {
  const response: ApiResponse = {
    success: true,
    data: state,
    message,
    timestamp: new Date().toISOString(),
  };
  res.json(response);
}

export class MatchController {
  static async listMatches(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matches = await MatchService.listMatches();
      sendState(res, matches);
    } catch (error) {
      next(error);
    }
  }

  static async createMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = await MatchService.createMatch(req.body || {});
      const state = await MatchService.getMatchState(matchId);
      sendState(res, state, 'Match created');
    } catch (error) {
      next(error);
    }
  }

  static async getCurrentMatch(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = await MatchService.getCurrentMatch();
      const state = await MatchService.getMatchState(matchId);
      sendState(res, state);
    } catch (error) {
      next(error);
    }
  }

  static async getActiveMatch(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const active = await MatchService.getActiveMatch();
      sendState(res, active || { matchId: null, status: null });
    } catch (error) {
      next(error);
    }
  }

  static async getMatchById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const state = await MatchService.getMatchState(matchId);
      sendState(res, state);
    } catch (error) {
      next(error);
    }
  }

  static async point(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const { team, delta, clientEventId } = req.body;
      const state = await MatchService.changeScore(matchId, team, delta ?? 1, { clientEventId, actorUserId: req.user?.id });
      sendState(res, state, 'Point updated');
    } catch (error) {
      next(error);
    }
  }

  static async action(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const { team, action, playerId, clientEventId } = req.body;
      const state = await MatchService.recordAction(matchId, team, action, { playerId, clientEventId, actorUserId: req.user?.id });
      sendState(res, state, `Action ${action} recorded`);
    } catch (error) {
      next(error);
    }
  }

  static async timeout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const { team, clientEventId } = req.body;
      const state = await MatchService.callTimeout(matchId, team, { clientEventId, actorUserId: req.user?.id });
      sendState(res, state, `Timeout called for Team ${team}`);
    } catch (error) {
      next(error);
    }
  }

  static async substitution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const state = await MatchService.recordSubstitution(matchId, req.body, { clientEventId: req.body?.clientEventId, actorUserId: req.user?.id });
      sendState(res, state, 'Substitution recorded');
    } catch (error) {
      next(error);
    }
  }

  static async undo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const state = await MatchService.undoLastEvent(matchId, { clientEventId: req.body?.clientEventId, actorUserId: req.user?.id });
      sendState(res, state, 'Last event undone');
    } catch (error) {
      next(error);
    }
  }

  static async endSet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const state = await MatchService.endSet(matchId, req.body || {});
      sendState(res, state, 'Set completed');
    } catch (error) {
      next(error);
    }
  }

  static async startSet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const state = await MatchService.startSet(matchId, req.body || {});
      sendState(res, state, 'Set started');
    } catch (error) {
      next(error);
    }
  }

  static async setup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const state = await MatchService.applySetup(matchId, req.body);
      sendState(res, state, 'Match setup updated');
    } catch (error) {
      next(error);
    }
  }

  static async info(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const state = await MatchService.updateInfo(matchId, req.body);
      sendState(res, state, 'Match info updated');
    } catch (error) {
      next(error);
    }
  }

  static async setStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const { status, reason } = req.body as { status: MatchStatus; reason?: string };
      const state = await MatchService.setStatus(matchId, status, reason);
      sendState(res, state, `Match status set to ${status}`);
    } catch (error) {
      next(error);
    }
  }

  static async getReadiness(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await MatchService.getReadiness(req.params.id);
      sendState(res, data);
    } catch (error) {
      next(error);
    }
  }

  static async goLive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const state = await MatchService.goLive(req.params.id);
      sendState(res, state, 'Match is LIVE');
    } catch (error) {
      next(error);
    }
  }

  static async getRoster(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await MatchService.getRoster(req.params.id, req.params.side);
      sendState(res, data);
    } catch (error) {
      next(error);
    }
  }

  static async putRoster(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const players = Array.isArray(req.body) ? req.body : (req.body?.players || []);
      const state = await MatchService.replaceRoster(req.params.id, req.params.side, players);
      sendState(res, state, 'Roster updated');
    } catch (error) {
      next(error);
    }
  }

  static async copyRoster(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const state = await MatchService.copyRosterFrom(req.params.id, req.params.side, req.params.otherMatchId);
      sendState(res, state, 'Roster copied');
    } catch (error) {
      next(error);
    }
  }

  static async putLineup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const setNumber = Number(req.params.setNumber);
      const state = await MatchService.setLineup(req.params.id, req.params.side, setNumber, req.body || {});
      sendState(res, state, 'Lineup updated');
    } catch (error) {
      next(error);
    }
  }

  static async getAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const analytics = await MatchService.getMatchAnalytics(matchId);
      sendState(res, analytics);
    } catch (error) {
      next(error);
    }
  }

  static async getReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchId = req.params.id || await MatchService.getCurrentMatch();
      const report = await MatchService.getMatchReport(matchId);
      sendState(res, report);
    } catch (error) {
      next(error);
    }
  }

  static async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        team: typeof req.query.team === 'string' ? req.query.team : undefined,
        tournament: typeof req.query.tournament === 'string' ? req.query.tournament : undefined,
        competition: typeof req.query.competition === 'string' ? req.query.competition : undefined,
        dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
        player: typeof req.query.player === 'string' ? req.query.player : undefined,
      };
      const data = await MatchService.getHistoricalAnalytics(filters);
      sendState(res, data);
    } catch (error) {
      next(error);
    }
  }

  static async resetMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const state = await MatchService.resetMatch(req.params.id);
      sendState(res, state, 'Match reset to 0-0');
    } catch (error) {
      next(error);
    }
  }

  static async archiveTestMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matchIds = Array.isArray(req.body?.matchIds) ? req.body.matchIds.map(String) : undefined;
      const data = await MatchService.archiveTestMatches(matchIds);
      sendState(res, data, `Archived ${data.archived.length} match(es)`);
    } catch (error) {
      next(error);
    }
  }
}

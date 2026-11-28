import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@qwesie/shared';
import { getActiveGraphicState, setActiveGraphicState, dismissActiveGraphic, GRAPHIC_TEMPLATES, startBreak, endBreak, getOutputPreviewState, setPreviewCue, takePreviewToProgram, clearProgram } from '../services/broadcast.service.js';
import { MatchService } from '../services/match.service.js';

function send(res: Response, data: any, message?: string) {
  const response: ApiResponse = { success: true, data, message, timestamp: new Date().toISOString() };
  res.json(response);
}

export class BroadcastController {
  static templates(_req: Request, res: Response) {
    send(res, GRAPHIC_TEMPLATES);
  }

  static async getState(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      send(res, await getActiveGraphicState(matchId));
    } catch (e) { next(e); }
  }

  static async setState(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const { template, visible, payload, durationSeconds } = req.body || {};
      if (!template) return res.status(400).json({ success: false, error: { message: 'template is required' }, timestamp: new Date().toISOString() });
      const state = await setActiveGraphicState(matchId, { template, visible, payload, durationSeconds });
      send(res, state, 'Graphic state updated');
    } catch (e) { next(e); }
  }

  static async dismiss(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const state = await dismissActiveGraphic(matchId);
      send(res, state, 'Graphic dismissed');
    } catch (e) { next(e); }
  }

  static async startBreak(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const { type, durationSeconds } = req.body || {};
      if (!type) return res.status(400).json({ success: false, error: { message: 'break type is required' }, timestamp: new Date().toISOString() });
      const state = await startBreak(matchId, type, durationSeconds != null ? Number(durationSeconds) : null);
      send(res, state, 'Break started');
    } catch (e) { next(e); }
  }

  static async endBreak(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const state = await endBreak(matchId);
      send(res, state, 'Break ended');
    } catch (e) { next(e); }
  }

  static async resume(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      let match: any = null;
      try { match = await MatchService.setStatus(matchId, 'LIVE'); } catch {}
      const { applyResume } = await import('../services/broadcast.service.js');
      const scene = await applyResume(matchId);
      send(res, { scene, match }, 'Match resumed and displays synchronized');
    } catch (e) { next(e); }
  }

  static async getPreview(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      send(res, await getOutputPreviewState(matchId));
    } catch (e) { next(e); }
  }

  static async setPreview(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const cue = req.body?.cue ?? req.body ?? {};
      send(res, await setPreviewCue(matchId, cue), 'Preview updated');
    } catch (e) { next(e); }
  }

  static async take(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const { transition, duration } = req.body || {};
      const scene = await takePreviewToProgram(matchId, { transition: transition ?? null, duration: duration ?? null });
      send(res, { scene }, 'Taken to program');
    } catch (e) { next(e); }
  }

  static async clear(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const scene = await clearProgram(matchId);
      send(res, { scene }, 'Program cleared');
    } catch (e) { next(e); }
  }

  static async getScene(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const { getOutputSceneState } = await import('../services/broadcast.service.js');
      send(res, await getOutputSceneState(matchId));
    } catch (e) { next(e); }
  }

  static async setScene(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const { setOutputScene } = await import('../services/broadcast.service.js');
      send(res, await setOutputScene(matchId, req.body || {}), 'Scene updated');
    } catch (e) { next(e); }
  }

  static async setAutoTriggers(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const { setAutoTriggers } = await import('../services/broadcast.service.js');
      send(res, await setAutoTriggers(matchId, req.body || {}), 'Auto-triggers updated');
    } catch (e) { next(e); }
  }

  static async getSequence(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const { getIntroSequence } = await import('../services/broadcast.service.js');
      send(res, await getIntroSequence(matchId));
    } catch (e) { next(e); }
  }

  static async updateSequence(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const { updateIntroSequence } = await import('../services/broadcast.service.js');
      send(res, await updateIntroSequence(matchId, req.body || {}), 'Intro sequence updated');
    } catch (e) { next(e); }
  }

  static async startSequence(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const { startIntroSequence } = await import('../services/broadcast.service.js');
      send(res, await startIntroSequence(matchId, req.body || {}), 'Intro sequence started');
    } catch (e) { next(e); }
  }

  static async controlSequence(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      const { controlIntroSequence } = await import('../services/broadcast.service.js');
      send(res, await controlIntroSequence(matchId, req.body || {}), 'Intro sequence updated');
    } catch (e) { next(e); }
  }
}

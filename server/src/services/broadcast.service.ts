import { prisma } from '../config/database.js';
import { broadcastActiveGraphicState, broadcastOutputPreviewState, broadcastOutputSceneState } from '../sockets/socketManager.js';
import { OutputSceneState, legacyScorebugSettingsFromTheme, scorebugThemeConfigFromLegacy, getBuiltinScorebugTheme } from '@qwesie/shared';
import { logger } from '../utils/logger.js';
import { getResolvedScorebugThemeForMatch } from './scorebugTheme.service.js';

export type GraphicTemplateId = 'MATCH_INTRO'|'TEAM_INTRO'|'STARTING_LINEUP'|'PLAYER_SPOTLIGHT'|'TEAM_COMPARISON'|'MATCH_STATISTICS'|'SET_RESULT'|'MATCH_MOMENTUM'|'TOP_PERFORMERS'|'FINAL_MATCH_RESULT'|'SET_ANALYSIS'|'PLAYER_LEADERBOARD';
export type BreakType = 'TEAM_A_TIMEOUT'|'TEAM_B_TIMEOUT'|'BETWEEN_SET'|'TECHNICAL_TIMEOUT'|'MATCH_SUSPENSION'|'NONE';

export type GraphicCue = {
  template: string | null; // null or 'SCOREBUG' = clear/scorebug-only
  payload?: Record<string, any>;
  duration?: number | null; // seconds; null/0 = manual
  autoReturn?: boolean;
};

type Scene = OutputSceneState['scene'];

const DEFAULT_AUTO = { setBreakSeconds: 20, timeoutSeconds: 30, setBreakEnabled: true, timeoutEnabled: true, finalEnabled: true, midMatchAfterSet: null as number | null, midMatchSeconds: 20 };
const pendingTimers = new Map<string, NodeJS.Timeout>();

function clearPendingTimer(matchId: string) {
  const t = pendingTimers.get(matchId);
  if (t) { try { clearTimeout(t); } catch {} pendingTimers.delete(matchId); }
}

export const GRAPHIC_TEMPLATES: Array<{ id: GraphicTemplateId; name: string; description: string }> = [
  { id: 'MATCH_INTRO', name: 'Match Introduction', description: 'Tournament context, teams, venue, and match opening presentation.' },
  { id: 'TEAM_INTRO', name: 'Team Introduction', description: 'Team-focused identity and roster spotlight before play.' },
  { id: 'STARTING_LINEUP', name: 'Starting Lineup', description: 'Starting six/lineup presentation with positions and jersey numbers.' },
  { id: 'PLAYER_SPOTLIGHT', name: 'Player Spotlight', description: 'Individual player spotlight with contributions and identity.' },
  { id: 'PLAYER_LEADERBOARD', name: 'Player Performance Leaderboard', description: 'Leading scorers, attackers, blockers, servers, defenders and contributions.' },
  { id: 'TEAM_COMPARISON', name: 'Full-screen Team Comparison', description: 'Head-to-head team comparison with detailed statistical breakdown.' },
  { id: 'MATCH_STATISTICS', name: 'General Match Statistics', description: 'Comprehensive full-screen match statistics presentation.' },
  { id: 'SET_ANALYSIS', name: 'Set-by-Set Analysis', description: 'Previous set results, current set, points per set, sets won and progression.' },
  { id: 'SET_RESULT', name: 'Set Result', description: 'Completed set summary and scoreline presentation.' },
  { id: 'MATCH_MOMENTUM', name: 'Match Momentum', description: 'Scoring progression, runs, recent sequences and distribution.' },
  { id: 'TOP_PERFORMERS', name: 'Top Performers', description: 'Leaders by key performance categories.' },
  { id: 'FINAL_MATCH_RESULT', name: 'Final Match Result', description: 'Closing graphic with winner, final sets, and match outcome.' },
];

// --- Studio/graphics template API adapters ---
const TEMPLATE_TO_SCENE: Record<string, Scene> = {
  MATCH_INTRO: 'BREAK_SLATE',
  TEAM_INTRO: 'LINEUPS',
  STARTING_LINEUP: 'LINEUPS',
  PLAYER_SPOTLIGHT: 'PLAYER_SPOTLIGHT',
  TEAM_COMPARISON: 'HEAD_TO_HEAD',
  MATCH_STATISTICS: 'MATCH_STATS',
  SET_RESULT: 'SET_BREAK',
  MATCH_MOMENTUM: 'MATCH_MOMENTUM',
  TOP_PERFORMERS: 'PLAYER_SPOTLIGHT',
  FINAL_MATCH_RESULT: 'FINAL',
  SET_ANALYSIS: 'SET_BREAK',
  PLAYER_LEADERBOARD: 'PLAYER_SPOTLIGHT',
  SCOREBUG: 'PLAY',
};

function sceneToTemplate(scene: Scene): string {
  const map: Record<string, string> = {
    SET_BREAK: 'SET_RESULT',
    TIMEOUT: 'MATCH_STATISTICS',
    MATCH_STATS: 'MATCH_STATISTICS',
    LINEUPS: 'STARTING_LINEUP',
    HEAD_TO_HEAD: 'TEAM_COMPARISON',
    PLAYER_SPOTLIGHT: 'PLAYER_SPOTLIGHT',
    MATCH_MOMENTUM: 'MATCH_MOMENTUM',
    FINAL: 'FINAL_MATCH_RESULT',
    BREAK_SLATE: 'MATCH_INTRO',
    PLAY: 'SCOREBUG',
  };
  return map[scene] || 'SCOREBUG';
}

function isTimedScene(scene: Scene) {
  return scene !== 'PLAY';
}

function normalizeCue(input: any): GraphicCue {
  const templateRaw = input?.template == null ? null : String(input.template).toUpperCase();
  const template = !templateRaw || templateRaw === 'SCOREBUG' || templateRaw === 'CLEAR' || templateRaw === 'PLAY' ? null : templateRaw;
  const duration = input?.duration != null && Number(input.duration) > 0
    ? Math.max(1, Math.round(Number(input.duration)))
    : (input?.durationSeconds != null && Number(input.durationSeconds) > 0 ? Math.max(1, Math.round(Number(input.durationSeconds))) : null);
  const payload = (input?.payload && typeof input.payload === 'object') ? input.payload : {};
  const autoReturn = input?.autoReturn == null ? !!duration : !!input.autoReturn;
  return { template, payload, duration, autoReturn };
}

function cueToProgram(cue: GraphicCue) {
  const template = cue.template && cue.template !== 'SCOREBUG' ? cue.template : null;
  const scene: Scene = template ? (TEMPLATE_TO_SCENE[template] || 'MATCH_STATS') : 'PLAY';
  const duration = cue.duration && cue.duration > 0 ? cue.duration : null;
  const timerEndsAt = template && duration && cue.autoReturn !== false ? new Date(Date.now() + duration * 1000) : null;
  return { template, scene, payload: template ? (cue.payload || {}) : {}, timerEndsAt };
}

function previewStateFromRow(row: any) {
  const p = (row.payload || {}) as any;
  const cue = p.previewCue || null;
  return {
    matchId: row.matchId,
    cue: cue ? {
      template: cue.template ?? null,
      payload: (cue.payload && typeof cue.payload === 'object') ? cue.payload : {},
      duration: cue.duration ?? null,
      autoReturn: cue.autoReturn ?? !!cue.duration,
    } : null,
    version: Number(cue?.version || p.previewVersion || 0),
    updatedAt: cue?.updatedAt || null,
  };
}

async function emitPreview(matchId: string, row: any) {
  const state = previewStateFromRow(row);
  broadcastOutputPreviewState(matchId, state);
  return state;
}

async function ensureRow(matchId: string) {
  let row = await prisma.broadcastGraphicState.findFirst({ where: { matchId, graphicType: 'SCENE' as any } });
  if (!row) {
    row = await prisma.broadcastGraphicState.create({ data: { matchId, graphicType: 'SCENE' as any, scene: 'PLAY' as any, isVisible: true, scorebugVisible: true, scorebugVariant: 'default', scorebugPosition: 'top-left', scorebugScale: 1, lockScene: false, payload: { autoTriggers: DEFAULT_AUTO, activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null, previewCue: null } } as any });
  }
  return row;
}

export function toState(row: any, revision = 0, resolvedTheme?: any): OutputSceneState {
  const payload = (row.payload || {}) as any;
  const sb = payload.scorebug || {};
  const scene = (row.scene || 'PLAY') as Scene;
  const activeTemplate = payload.activeTemplate ?? null;
  const template = scene === 'PLAY' || activeTemplate === 'SCOREBUG' ? null : (activeTemplate ?? null);
  const startedAt = payload.graphicStartedAt || payload.startedAt || null;

  const legacySettings = {
    visible: row.scorebugVisible ?? sb.visible ?? true,
    variant: row.scorebugVariant || sb.variant || 'classic',
    position: row.scorebugPosition || sb.position || 'top-left',
    scale: row.scorebugScale ?? sb.scale ?? 1,
    showSetHistory: sb.showSetHistory ?? false,
    showPreMatch: sb.showPreMatch ?? true,
    showLogos: sb.showLogos ?? true,
    showTournament: sb.showTournament ?? true,
    tournamentLabel: sb.tournamentLabel ?? null,
  };

  const baseTheme = resolvedTheme || { ...getBuiltinScorebugTheme('Classic'), source: 'builtin' };
  const themeConfig = baseTheme?.config
    ? (baseTheme.source === 'builtin' && !payload.scorebugThemeExplicit
        ? scorebugThemeConfigFromLegacy(legacySettings)
        : baseTheme.config)
    : scorebugThemeConfigFromLegacy(legacySettings);

  // Keep legacy scorebug fields populated for backward compatibility.
  const legacyFromTheme = legacyScorebugSettingsFromTheme(themeConfig as any, legacySettings.visible, legacySettings.showPreMatch);
  const effectiveScorebug = {
    ...legacyFromTheme,
    // Operational toggles remain server-authoritative from row/payload.
    visible: legacySettings.visible,
    showPreMatch: legacySettings.showPreMatch,
    // If payload has explicit legacy toggles, keep them when no explicit theme assignment.
    showSetHistory: payload.scorebugThemeExplicit ? (themeConfig as any).content?.showSetHistory ?? legacyFromTheme.showSetHistory : legacySettings.showSetHistory,
    showLogos: payload.scorebugThemeExplicit ? (themeConfig as any).content?.showLogos ?? legacyFromTheme.showLogos : legacySettings.showLogos,
    showTournament: payload.scorebugThemeExplicit ? (themeConfig as any).content?.showTournament ?? legacyFromTheme.showTournament : legacySettings.showTournament,
    tournamentLabel: payload.scorebugThemeExplicit ? ((themeConfig as any).content?.tournamentLabel ?? null) : legacySettings.tournamentLabel,
  };

  const themeMeta = baseTheme ? {
    id: baseTheme.id,
    name: baseTheme.name,
    version: baseTheme.version || 1,
    isBuiltIn: !!baseTheme.isBuiltIn,
    config: themeConfig,
  } : null;

  return {
    matchId: row.matchId,
    scene,
    template,
    payload: (payload.graphicPayload && typeof payload.graphicPayload === 'object') ? payload.graphicPayload : {},
    startedAt: startedAt ? new Date(startedAt).toISOString() : null,
    scorebug: {
      ...effectiveScorebug,
      theme: themeConfig,
      themeId: themeMeta?.id ?? null,
      themeVersion: themeMeta?.version ?? null,
      themeName: themeMeta?.name ?? null,
    },
    scorebugTheme: themeMeta,
    lock: !!row.lockScene,
    timerEndsAt: row.timerEndsAt ? new Date(row.timerEndsAt).toISOString() : null,
    autoTriggers: { ...DEFAULT_AUTO, ...(payload.autoTriggers || {}) },
    version: row.version || 1,
    revision,
  };
}

function graphicStateFromRow(row: any) {
  const payload = (row.payload || {}) as any;
  const activeTemplate = payload.activeTemplate || 'SCOREBUG';
  const scene = (row.scene || 'PLAY') as Scene;
  const breakState = payload.breakState || { active: false, type: 'NONE', label: 'Live Play', startedAt: null, endsAt: null, durationSeconds: null, suggestedTemplates: [] };
  const isBreakScene = scene === 'TIMEOUT' || scene === 'SET_BREAK';
  const visible = scene === 'PLAY' ? false : (!!row.isVisible || (payload.graphicVisible ?? true));
  return {
    matchId: row.matchId,
    activeTemplate,
    visible,
    payload: (payload.graphicPayload && typeof payload.graphicPayload === 'object') ? payload.graphicPayload : {},
    startedAt: payload.graphicStartedAt ? new Date(payload.graphicStartedAt).toISOString() : null,
    timerEndsAt: row.timerEndsAt ? new Date(row.timerEndsAt).toISOString() : null,
    version: row.version || 1,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    breakState: { ...breakState, active: !!breakState.active && isBreakScene ? true : !!breakState.active },
    scene,
  };
}

async function emitProgram(matchId: string, row: any) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { revision: true, court: true } });
  const theme = await getResolvedScorebugThemeForMatch(matchId).catch(() => null);
  const state = toState(row, match?.revision || 0, theme);
  broadcastOutputSceneState(matchId, state, match?.court); // program/OBS only
  try { broadcastActiveGraphicState(matchId, graphicStateFromRow(row), match?.court); } catch {}
  return state;
}

// Backward-compat alias used internally by older code paths
async function emitScene(matchId: string, row: any) { return emitProgram(matchId, row); }

async function readGraphicState(matchId: string) {
  const row = await ensureRow(matchId);
  return graphicStateFromRow(row);
}

function scheduleAutoReturn(matchId: string, scene: Scene, endsAt: Date, next?: { scene: Scene; seconds?: number | null; template?: string | null; payload?: Record<string, any> | null; startedAt?: string | null }) {
  clearPendingTimer(matchId);
  const ms = Math.max(0, endsAt.getTime() - Date.now());
  const timer = setTimeout(async () => {
    pendingTimers.delete(matchId);
    try {
      const cur = await ensureRow(matchId);
      if (cur.lockScene) return;
      if ((cur.scene as any) !== scene) return;
      const curEnds = cur.timerEndsAt ? new Date(cur.timerEndsAt).getTime() : 0;
      if (curEnds && curEnds > Date.now() + 100) return; // extended/replaced
      const nextScene = next?.scene || 'PLAY';
      const nextEnds = nextScene !== 'PLAY' && next?.seconds && next.seconds > 0
        ? new Date(Date.now() + next.seconds * 1000)
        : null;
      const curPayload = (cur.payload as any) || {};
      const nextTemplate = nextScene === 'PLAY' ? 'SCOREBUG' : (next?.template ?? curPayload.activeTemplate ?? sceneToTemplate(nextScene));
      const nextPayload = {
        ...curPayload,
        activeTemplate: nextTemplate,
        graphicPayload: nextScene === 'PLAY' ? {} : (next?.payload ?? curPayload.graphicPayload ?? {}),
        graphicStartedAt: nextScene === 'PLAY' ? null : (next?.startedAt ?? (nextEnds ? new Date().toISOString() : (curPayload.graphicStartedAt || new Date().toISOString()))),
        graphicVisible: nextScene !== 'PLAY',
      };
      const back = await prisma.broadcastGraphicState.update({
        where: { id: cur.id },
        data: {
          scene: nextScene as any,
          timerEndsAt: nextEnds,
          isVisible: nextScene !== 'PLAY',
          payload: nextPayload,
          version: { increment: 1 },
        } as any,
      });
      await emitProgram(matchId, back);
      if (nextEnds && isTimedScene(nextScene)) scheduleAutoReturn(matchId, nextScene, nextEnds);
    } catch (e) {
      logger.warn(`Auto-return timer failed for match ${matchId}: ${(e as Error)?.message || e}`);
    }
  }, ms + 60);
  timer.unref?.();
  pendingTimers.set(matchId, timer);
}

export async function getOutputSceneState(matchId: string): Promise<OutputSceneState> {
  const row = await ensureRow(matchId);
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { revision: true } });
  const theme = await getResolvedScorebugThemeForMatch(matchId).catch(() => null);
  return toState(row, match?.revision || 0, theme);
}

export async function getOutputPreviewState(matchId: string) {
  const row = await ensureRow(matchId);
  return previewStateFromRow(row);
}

async function applyProgramCue(matchId: string, cueInput: any, opts?: { durationOverride?: number | null; transition?: string | null }) {
  const cue = normalizeCue(cueInput);
  if (opts && opts.durationOverride !== undefined) {
    cue.duration = opts.durationOverride != null && Number(opts.durationOverride) > 0 ? Math.max(1, Math.round(Number(opts.durationOverride))) : null;
  }
  const prog = cueToProgram(cue);
  const prev = await ensureRow(matchId);
  const prevPayload = (prev.payload as any) || {};
  const payload = {
    ...prevPayload,
    activeTemplate: prog.template || 'SCOREBUG',
    graphicPayload: prog.payload || {},
    graphicStartedAt: prog.template ? new Date().toISOString() : null,
    graphicVisible: !!prog.template,
  };
  const row = await prisma.broadcastGraphicState.update({
    where: { id: prev.id },
    data: {
      scene: prog.scene as any,
      timerEndsAt: prog.timerEndsAt,
      isVisible: !!prog.template,
      payload,
      version: { increment: 1 },
    } as any,
  });
  clearPendingTimer(matchId);
  if (prog.timerEndsAt && isTimedScene(prog.scene)) {
    if (prog.timerEndsAt.getTime() <= Date.now() + 50) {
      const p = (row.payload as any) || {};
      const back = await prisma.broadcastGraphicState.update({ where: { id: row.id }, data: { scene: 'PLAY' as any, timerEndsAt: null, isVisible: false, payload: { ...p, activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null, graphicVisible: false }, version: { increment: 1 } } as any });
      return emitProgram(matchId, back);
    }
    scheduleAutoReturn(matchId, prog.scene, prog.timerEndsAt);
  }
  return emitProgram(matchId, row);
}

export async function setPreviewCue(matchId: string, cueInput: any) {
  const cue = normalizeCue(cueInput);
  const prev = await ensureRow(matchId);
  const prevPayload = (prev.payload as any) || {};
  const prevVer = Number(prevPayload.previewCue?.version || prevPayload.previewVersion || 0);
  const previewCue = {
    template: cue.template,
    payload: cue.payload || {},
    duration: cue.duration ?? null,
    autoReturn: cue.autoReturn !== false,
    version: prevVer + 1,
    updatedAt: new Date().toISOString(),
  };
  const row = await prisma.broadcastGraphicState.update({
    where: { id: prev.id },
    data: { payload: { ...prevPayload, previewCue, previewVersion: previewCue.version } },
  });
  return emitPreview(matchId, row);
}

export async function takePreviewToProgram(matchId: string, opts?: { transition?: string | null; duration?: number | null }) {
  const prev = await ensureRow(matchId);
  const prevPayload = (prev.payload as any) || {};
  const cue = prevPayload.previewCue ? normalizeCue(prevPayload.previewCue) : { template: null, payload: {}, duration: null, autoReturn: true };
  return applyProgramCue(matchId, cue, { durationOverride: opts?.duration, transition: opts?.transition || null });
}

export async function clearProgram(matchId: string) {
  // "Clear" removes program graphic and restores scorebug
  return applyProgramCue(matchId, { template: null, payload: {}, duration: null, autoReturn: false });
}

export async function setAutoTriggers(matchId: string, triggers: Partial<typeof DEFAULT_AUTO>) {
  const prev = await ensureRow(matchId);
  const payload = { ...(prev.payload as any || {}), autoTriggers: { ...DEFAULT_AUTO, ...(((prev.payload as any)?.autoTriggers)||{}), ...triggers } };
  const row = await prisma.broadcastGraphicState.update({ where: { id: prev.id }, data: { payload, version: { increment: 1 } } });
  return emitProgram(matchId, row);
}

async function autoTransition(matchId: string, scene: Scene, seconds?: number | null, next?: { scene: Scene; seconds?: number | null; template?: string | null; payload?: Record<string, any> | null }) {
  const prev = await ensureRow(matchId);
  if (prev.lockScene) {
    const theme = await getResolvedScorebugThemeForMatch(matchId).catch(() => null);
    return toState(prev, 0, theme);
  }
  const endsAt = seconds && seconds > 0 ? new Date(Date.now() + seconds * 1000) : null;
  const prevPayload = (prev.payload as any) || {};
  const template = scene === 'PLAY' ? 'SCOREBUG' : (next && next.scene === scene && next.template ? next.template : sceneToTemplate(scene));
  const breakType = scene === 'SET_BREAK' ? 'BETWEEN_SET' : scene === 'TIMEOUT' ? 'TEAM_A_TIMEOUT' : null; // generic for auto-triggers
  const breakState = (scene === 'SET_BREAK' || scene === 'TIMEOUT')
    ? {
        active: true,
        type: breakType,
        label: scene === 'SET_BREAK' ? 'Between-Set Interval' : 'Timeout',
        startedAt: new Date().toISOString(),
        endsAt: endsAt ? endsAt.toISOString() : null,
        durationSeconds: seconds ?? null,
        suggestedTemplates: scene === 'SET_BREAK' ? ['SET_RESULT','SET_ANALYSIS','MATCH_STATISTICS','TEAM_COMPARISON','MATCH_MOMENTUM'] : ['MATCH_STATISTICS','TEAM_COMPARISON','PLAYER_SPOTLIGHT','SET_ANALYSIS'],
      }
    : (scene === 'PLAY' ? { ...(prevPayload.breakState || {}), active: false } : prevPayload.breakState);
  const payload = {
    ...prevPayload,
    activeTemplate: template,
    graphicPayload: scene === 'PLAY' ? {} : (prevPayload.graphicPayload || {}),
    graphicStartedAt: scene === 'PLAY' ? null : new Date().toISOString(),
    graphicVisible: scene !== 'PLAY',
    ...(breakState !== undefined ? { breakState } : {}),
  };
  const row = await prisma.broadcastGraphicState.update({
    where: { id: prev.id },
    data: { scene, timerEndsAt: endsAt, isVisible: scene !== 'PLAY', payload, version: { increment: 1 } } as any,
  });
  const state = await emitProgram(matchId, row);
  clearPendingTimer(matchId);
  if (endsAt && isTimedScene(scene)) {
    scheduleAutoReturn(matchId, scene, endsAt, next);
  }
  return state;
}

/** Mid-match stats default: after set 2 in a best-of-5, after set 1 in a best-of-3. */
function defaultMidMatchSet(bestOfSets?: number | null) {
  return (bestOfSets || 5) >= 5 ? 2 : 1;
}

// Server auto-triggers (called after committed match events)
export async function onMatchEventCommitted(matchId: string, eventType: string) {
  const row = await ensureRow(matchId);
  const auto = { ...DEFAULT_AUTO, ...(((row.payload as any)?.autoTriggers)||{}) };
  if (row.lockScene) return;

  if (eventType === 'SET_COMPLETED' && auto.setBreakEnabled) {
    const match = await prisma.match.findUnique({ where: { id: matchId }, select: { bestOfSets: true } });
    const completedSet = await prisma.matchSet.count({ where: { matchId, status: 'COMPLETED' as any } });
    const midAfter = auto.midMatchAfterSet == null ? defaultMidMatchSet(match?.bestOfSets) : Number(auto.midMatchAfterSet);
    const next = midAfter > 0 && completedSet === midAfter
      ? { scene: 'MATCH_STATS' as Scene, seconds: auto.midMatchSeconds ?? 20, template: 'MATCH_STATISTICS' as string }
      : undefined;
    await autoTransition(matchId, 'SET_BREAK', auto.setBreakSeconds, next);
  } else if (eventType === 'TIMEOUT_CALLED' && auto.timeoutEnabled) {
    await autoTransition(matchId, 'TIMEOUT', auto.timeoutSeconds);
  } else if (eventType === 'MATCH_COMPLETED' && auto.finalEnabled) {
    await autoTransition(matchId, 'FINAL', null);
  } else if (eventType === 'MATCH_STATUS_CHANGED') {
    const match = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true } });
    if (match?.status === 'COMPLETED' && auto.finalEnabled) await autoTransition(matchId, 'FINAL', null);
  }
}

export async function applyResume(matchId: string) {
  const row = await ensureRow(matchId);
  clearPendingTimer(matchId);
  const prevPayload = (row.payload as any) || {};
  const payload = { ...prevPayload, activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null, graphicVisible: false, breakState: { ...(prevPayload.breakState || {}), active: false } };
  const updated = await prisma.broadcastGraphicState.update({ where: { id: row.id }, data: { scene: 'PLAY' as any, timerEndsAt: null, lockScene: false, isVisible: false, scorebugVisible: true, payload, version: { increment: 1 } } as any });
  return emitProgram(matchId, updated);
}

export async function setOutputScene(matchId: string, input: { scene?: Scene; lock?: boolean; timerEndsAt?: string | null; template?: string | null; payload?: Record<string, any>; startedAt?: string | null; scorebug?: { visible?: boolean; variant?: string; position?: string; scale?: number; showSetHistory?: boolean; showPreMatch?: boolean; showLogos?: boolean; showTournament?: boolean; tournamentLabel?: string | null } }) {
  const prev = await ensureRow(matchId);
  const prevPayload = (prev.payload as any) || {};
  const nextScene = (input.scene ?? (prev.scene as Scene) ?? 'PLAY') as Scene;
  const data: any = { version: { increment: 1 } };
  let payload = { ...prevPayload };

  if (input.scene) data.scene = input.scene;
  if (input.lock != null) data.lockScene = !!input.lock;
  if (input.timerEndsAt !== undefined) data.timerEndsAt = input.timerEndsAt ? new Date(input.timerEndsAt) : null;

  if (input.scene !== undefined || input.template !== undefined || input.payload !== undefined || input.startedAt !== undefined || input.timerEndsAt !== undefined) {
    const template = nextScene === 'PLAY' ? 'SCOREBUG' : (input.template ?? prevPayload.activeTemplate ?? sceneToTemplate(nextScene));
    payload.activeTemplate = template;
    if (input.payload !== undefined) payload.graphicPayload = input.payload || {};
    if (input.startedAt !== undefined) payload.graphicStartedAt = input.startedAt ? new Date(input.startedAt).toISOString() : null;
    else if (input.scene && nextScene !== 'PLAY' && !payload.graphicStartedAt) payload.graphicStartedAt = new Date().toISOString();
    if (nextScene === 'PLAY') { payload.graphicPayload = {}; payload.graphicStartedAt = null; payload.graphicVisible = false; }
    else payload.graphicVisible = true;
    data.isVisible = nextScene !== 'PLAY';
  }

  if (input.scorebug) {
    if (input.scorebug.visible != null) data.scorebugVisible = !!input.scorebug.visible;
    if (input.scorebug.variant != null) data.scorebugVariant = input.scorebug.variant;
    if (input.scorebug.position != null) data.scorebugPosition = input.scorebug.position;
    if (input.scorebug.scale != null) data.scorebugScale = Number(input.scorebug.scale);
    const prevScorebug = payload.scorebug || {};
    payload.scorebug = {
      ...prevScorebug,
      ...(input.scorebug.showSetHistory != null ? { showSetHistory: !!input.scorebug.showSetHistory } : {}),
      ...(input.scorebug.showPreMatch != null ? { showPreMatch: !!input.scorebug.showPreMatch } : {}),
      ...(input.scorebug.showLogos != null ? { showLogos: !!input.scorebug.showLogos } : {}),
      ...(input.scorebug.showTournament != null ? { showTournament: !!input.scorebug.showTournament } : {}),
      ...(input.scorebug.tournamentLabel !== undefined ? { tournamentLabel: input.scorebug.tournamentLabel == null || String(input.scorebug.tournamentLabel).trim() === '' ? null : String(input.scorebug.tournamentLabel) } : {}),
    };
  }

  data.payload = payload;
  const row = await prisma.broadcastGraphicState.update({ where: { id: prev.id }, data });
  clearPendingTimer(matchId);
  const scene = (row.scene as Scene) || 'PLAY';
  const endsAt = row.timerEndsAt ? new Date(row.timerEndsAt) : null;
  if (!row.lockScene && isTimedScene(scene) && endsAt) {
    if (endsAt.getTime() <= Date.now() + 50) {
      const p = (row.payload as any) || {};
      const back = await prisma.broadcastGraphicState.update({ where: { id: row.id }, data: { scene: 'PLAY' as any, timerEndsAt: null, isVisible: false, payload: { ...p, activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null, graphicVisible: false }, version: { increment: 1 } } as any });
      return emitProgram(matchId, back);
    }
    scheduleAutoReturn(matchId, scene, endsAt);
  }
  return emitProgram(matchId, row);
}

/**
 * Restart recovery: re-schedule break/auto-trigger timers from persisted scene state.
 */
export async function recoverBroadcastTimers() {
  try {
    const rows = await prisma.broadcastGraphicState.findMany({
      where: { graphicType: 'SCENE' as any, scene: { not: 'PLAY' as any }, timerEndsAt: { not: null } } as any,
    });
    let recovered = 0;
    for (const row of rows) {
      const matchId = row.matchId;
      if ((row as any).lockScene) { clearPendingTimer(matchId); continue; }
      const endsAt = row.timerEndsAt ? new Date(row.timerEndsAt) : null;
      const scene = row.scene as Scene;
      if (!endsAt || endsAt.getTime() <= Date.now() + 50) {
        const p = (row.payload as any) || {};
        const back = await prisma.broadcastGraphicState.update({ where: { id: row.id }, data: { scene: 'PLAY' as any, timerEndsAt: null, isVisible: false, payload: { ...p, activeTemplate: 'SCOREBUG', graphicPayload: {}, graphicStartedAt: null, graphicVisible: false }, version: { increment: 1 } } as any });
        await emitProgram(matchId, back);
        recovered++;
      } else {
        scheduleAutoReturn(matchId, scene, endsAt);
        recovered++;
      }
    }
    if (recovered) logger.info(`Broadcast timer recovery processed ${recovered} scene(s)`);
    return recovered;
  } catch (e) {
    logger.warn(`Broadcast timer recovery failed: ${(e as Error)?.message || e}`);
    return 0;
  }
}

// --- Old endpoints as thin wrappers (backward compatibility) ---
const BREAK_SUGGESTIONS: Record<string, string[]> = {
  TEAM_A_TIMEOUT: ['MATCH_STATISTICS', 'TEAM_COMPARISON', 'PLAYER_SPOTLIGHT', 'SET_ANALYSIS'],
  TEAM_B_TIMEOUT: ['MATCH_STATISTICS', 'TEAM_COMPARISON', 'PLAYER_SPOTLIGHT', 'SET_ANALYSIS'],
  BETWEEN_SET: ['SET_RESULT', 'SET_ANALYSIS', 'MATCH_STATISTICS', 'TEAM_COMPARISON', 'MATCH_MOMENTUM'],
  TECHNICAL_TIMEOUT: ['MATCH_STATISTICS', 'TEAM_COMPARISON', 'SET_ANALYSIS'],
  MATCH_SUSPENSION: ['MATCH_STATISTICS', 'SET_ANALYSIS', 'BREAK_SLATE'],
  NONE: [],
};

const BREAK_LABELS: Record<string, string> = {
  TEAM_A_TIMEOUT: 'Team A Timeout',
  TEAM_B_TIMEOUT: 'Team B Timeout',
  BETWEEN_SET: 'Between-Set Interval',
  TECHNICAL_TIMEOUT: 'Technical Timeout',
  MATCH_SUSPENSION: 'Match Suspension',
  NONE: 'Live Play',
};

export async function getActiveGraphicState(matchId: string) {
  return readGraphicState(matchId);
}

export async function setActiveGraphicState(matchId: string, input: any) {
  const template = String(input?.template || 'SCOREBUG').toUpperCase();
  const visible = input?.visible !== false;
  if (!visible || template === 'SCOREBUG') {
    await applyProgramCue(matchId, { template: null, payload: {}, duration: null, autoReturn: false });
    return readGraphicState(matchId);
  }
  const duration = input?.durationSeconds != null ? Number(input.durationSeconds) : (input?.duration != null ? Number(input.duration) : null);
  await applyProgramCue(matchId, { template, payload: input?.payload || {}, duration, autoReturn: duration != null && duration > 0 });
  return readGraphicState(matchId);
}

export async function dismissActiveGraphic(matchId: string) {
  await clearProgram(matchId);
  return readGraphicState(matchId);
}

export async function startBreak(matchId: string, type: BreakType, durationSeconds?: number | null) {
  const t = (type || 'TEAM_A_TIMEOUT') as string;
  const dur = durationSeconds != null ? Number(durationSeconds) : null;
  const scene: Scene = t === 'BETWEEN_SET' ? 'SET_BREAK' : 'TIMEOUT';
  const prev = await ensureRow(matchId);
  const prevPayload = (prev.payload as any) || {};
  const suggested = BREAK_SUGGESTIONS[t] || [];
  const template = (prevPayload.activeTemplate && prevPayload.activeTemplate !== 'SCOREBUG') ? prevPayload.activeTemplate : (scene === 'SET_BREAK' ? 'SET_RESULT' : 'MATCH_STATISTICS');
  const breakState = {
    active: true,
    type: t,
    label: BREAK_LABELS[t] || 'Break',
    startedAt: new Date().toISOString(),
    endsAt: dur && dur > 0 ? new Date(Date.now() + dur * 1000).toISOString() : null,
    durationSeconds: dur,
    suggestedTemplates: suggested,
  };
  // Take suggested cue with countdown (program)
  const cue: GraphicCue = { template, payload: { breakType: t, breakLabel: breakState.label }, duration: dur, autoReturn: !!dur && dur > 0 };
  const prog = cueToProgram(cue);
  const payload = {
    ...prevPayload,
    activeTemplate: prog.template || 'SCOREBUG',
    graphicPayload: prog.payload || {},
    graphicStartedAt: new Date().toISOString(),
    graphicVisible: true,
    breakState,
  };
  const row = await prisma.broadcastGraphicState.update({
    where: { id: prev.id },
    data: { scene: prog.scene as any, timerEndsAt: prog.timerEndsAt, isVisible: true, payload, version: { increment: 1 } } as any,
  });
  clearPendingTimer(matchId);
  if (prog.timerEndsAt && isTimedScene(prog.scene)) scheduleAutoReturn(matchId, prog.scene, prog.timerEndsAt);
  await emitProgram(matchId, row);
  return readGraphicState(matchId);
}

export async function endBreak(matchId: string) {
  const prev = await ensureRow(matchId);
  const old = ((prev.payload as any) || {}).breakState || {};
  const payload = { ...(prev.payload as any || {}), breakState: { ...old, active: false, endsAt: old.endsAt || new Date().toISOString(), suggestedTemplates: old.suggestedTemplates || [] } };
  const row = await prisma.broadcastGraphicState.update({ where: { id: prev.id }, data: { payload, version: { increment: 1 } } as any });
  await emitProgram(matchId, row);
  return readGraphicState(matchId);
}

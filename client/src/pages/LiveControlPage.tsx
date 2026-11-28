import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { SOCKET_EVENTS, MatchState } from '@qwesie/shared';
import { Radio, Wifi, WifiOff, RotateCcw, Play, Monitor, ArrowLeftRight, Shield, Clock3, ChevronRight, Tv, Copy, ArrowRightCircle, XCircle, X, Eye, SlidersHorizontal, Coffee, TimerReset, RefreshCw, Layers, Gauge, ExternalLink } from 'lucide-react';
import { broadcastApi, lineupApi, matchApi, scorebugThemeApi, systemApi } from '../services/api.js';
import { loadSettings } from './SettingsPage.js';
import { getSocket } from '../services/socket.js';
import { useMatch } from '../hooks/useMatch.js';
import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { Badge } from '../components/ui/Badge.js';
import { Input, Label, Select } from '../components/ui/Input.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Avatar } from '../components/ui/Avatar.js';
import { ScaledStage } from '../components/broadcast/ScaledStage.js';
import { ScorebugOverlay } from '../components/broadcast/ScorebugOverlay.js';
import { SCENE_COMPONENTS, TEMPLATE_COMPONENTS } from '../features/broadcast/templates.js';
import { useNotification } from '../contexts/NotificationContext.js';
import OutputsPanel from '../components/outputs/OutputsPanel.js';
import { CourtConflictDialog, getCourtConflict, type CourtConflict } from '../components/match/CourtConflictDialog.js';
import { cn } from '../utils/cn.js';
import { buildCourtOutputUrl, resolveOutputBaseUrl } from '../utils/outputUrls.js';
import { copyToClipboard } from '../utils/clipboard.js';
import { withOverlayBg } from '../utils/overlay.js';
import { CourtDiagram, assignmentsFromArray, assignmentsToArray, type LineupAssignments, type CourtPlayer } from '../components/lineup/CourtDiagram.js';

type TeamKey = 'A' | 'B';
type Conn = 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';
type PendingState = 'idle' | 'pending' | 'sent' | 'failed' | 'queued';
type Cue = { template: string | null; payload?: Record<string, any>; duration?: number | null; autoReturn?: boolean };
type TabKey = 'score' | 'graphics' | 'outputs';

const ACTIONS = ['KILL','ACE','BLOCK','DIG','ASSIST','ATTACK ERROR','SERVICE ERROR','RECEPTION ERROR'] as const;
const SCENE_BTNS: Array<{ scene: string; label: string; key?: string; cue: Cue }> = [
  { scene: 'PLAY', label: 'PLAY', key: '1', cue: { template: null, payload: {}, duration: null, autoReturn: false } },
  { scene: 'MATCH_STATS', label: 'STATS', key: '2', cue: { template: 'MATCH_STATISTICS', payload: {}, duration: null, autoReturn: false } },
  { scene: 'LINEUPS', label: 'LINEUPS', key: '3', cue: { template: 'STARTING_LINEUP', payload: {}, duration: null, autoReturn: false } },
  { scene: 'HEAD_TO_HEAD', label: 'H2H', key: '4', cue: { template: 'TEAM_COMPARISON', payload: {}, duration: null, autoReturn: false } },
  { scene: 'PLAYER_SPOTLIGHT', label: 'SPOTLIGHT', key: '5', cue: { template: 'PLAYER_SPOTLIGHT', payload: {}, duration: null, autoReturn: false } },
  { scene: 'FINAL', label: 'FINAL', key: '6', cue: { template: 'FINAL_MATCH_RESULT', payload: {}, duration: null, autoReturn: false } },
  { scene: 'BREAK_SLATE', label: 'SLATE', key: '7', cue: { template: 'MATCH_INTRO', payload: {}, duration: null, autoReturn: false } },
];
const TEMPLATE_TO_SCENE: Record<string, string> = {
  MATCH_INTRO: 'BREAK_SLATE', TEAM_INTRO: 'LINEUPS', STARTING_LINEUP: 'LINEUPS', STARTING_SIX_COURT: 'LINEUPS', TEAM_SQUAD_PROFILES: 'LINEUPS', TEAM_ROSTER_GRID: 'LINEUPS', PLAYER_SPOTLIGHT: 'PLAYER_SPOTLIGHT', TEAM_COMPARISON: 'HEAD_TO_HEAD', MATCH_STATISTICS: 'MATCH_STATS', SET_RESULT: 'SET_BREAK', MATCH_MOMENTUM: 'MATCH_MOMENTUM', TOP_PERFORMERS: 'PLAYER_SPOTLIGHT', FINAL_MATCH_RESULT: 'FINAL', SET_ANALYSIS: 'SET_BREAK', PLAYER_LEADERBOARD: 'PLAYER_SPOTLIGHT', LEADERBOARD: 'MATCH_STATS', FIXTURES: 'BREAK_SLATE', PLAYER_LEADERS: 'PLAYER_SPOTLIGHT', PLAYER_LEADERS_GRID: 'MATCH_STATS', LEADERBOARD_COMBINED: 'MATCH_STATS',
};
const BREAK_TYPES = [
  { id: 'TEAM_A_TIMEOUT', label: 'Team A Timeout', defaultDuration: 30 },
  { id: 'TEAM_B_TIMEOUT', label: 'Team B Timeout', defaultDuration: 30 },
  { id: 'BETWEEN_SET', label: 'Between-Set Interval', defaultDuration: 180 },
  { id: 'TECHNICAL_TIMEOUT', label: 'Technical Timeout', defaultDuration: 60 },
  { id: 'MATCH_SUSPENSION', label: 'Match Suspension', defaultDuration: 0 },
] as const;

const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const shortName = (name?: string | null) => {
  if (!name) return 'Player';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 12);
  return `${parts[0][0] || ''}. ${parts[parts.length - 1]}`.slice(0, 14);
};
const cueLabel = (cue?: Cue | null) => (!cue?.template ? 'SCOREBUG / CLEAR' : String(cue.template).replace(/_/g, ' '));
const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as any).isContentEditable);
};

const CountdownText: React.FC<{ endsAt?: string | null }> = React.memo(({ endsAt }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!endsAt) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [endsAt]);
  if (!endsAt) return <>--:--</>;
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return <>--:--</>;
  const total = Math.max(0, Math.ceil((end - now) / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return <>{m}:{String(s).padStart(2, '0')}</>;
});

const ElapsedClock: React.FC<{ startedAt?: string | null; endedAt?: string | null; status?: string | null }> = React.memo(({ startedAt, endedAt, status }) => {
  const [elapsed, setElapsed] = useState('00:00:00');
  useEffect(() => {
    if (!startedAt) { setElapsed('00:00:00'); return; }
    const tick = () => {
      const start = new Date(startedAt).getTime();
      const end = endedAt ? new Date(endedAt).getTime() : Date.now();
      const diff = Math.max(0, Math.floor((end - start) / 1000));
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt, endedAt, status]);
  return <>{elapsed}</>;
});

function describeUndo(ev: any, match: MatchState | undefined) {
  if (!ev) return 'Undo last event';
  const teamKey = ev.team as TeamKey | undefined;
  const teamShort = teamKey ? (match?.teams?.[teamKey]?.shortName || teamKey) : '';
  const pid = ev.playerId || ev.payload?.playerId;
  let jersey = '';
  if (pid && teamKey) {
    const t = match?.teams?.[teamKey];
    const p = [...(t?.lineup || []), ...(t?.bench || [])].find((x: any) => String(x.id) === String(pid));
    if (p?.jerseyNumber != null) jersey = `#${p.jerseyNumber} `;
  } else if (ev.payload?.out != null || ev.payload?.in != null) {
    jersey = `#${ev.payload?.out ?? '?'}→#${ev.payload?.in ?? '?'} `;
  }
  const action = ev.action === 'ACTION_RECORDED' ? String(ev.payload?.action || 'Action') : String(ev.action || 'Event');
  return `Undo: ${action.replace(/_/g,' ')} ${jersey}${teamShort}`.trim();
}

function sceneFromCue(cue: Cue | null | undefined): any {
  if (!cue || !cue.template) return { scene: 'PLAY', template: null, payload: {}, version: 0, scorebug: { visible: true } };
  const template = String(cue.template).toUpperCase();
  const scene = TEMPLATE_TO_SCENE[template] || 'MATCH_STATS';
  return { scene, template, payload: cue.payload || {}, version: 1, scorebug: { visible: true } };
}

const MonitorView: React.FC<{ match: any; scene: any; label: string; onAir?: boolean }> = ({ match, scene, label, onAir }) => {
  const s = scene || { scene: 'PLAY', template: null, payload: {}, scorebug: { visible: true } };
  const template = s.template || (s.scene === 'FINAL' ? 'FINAL_MATCH_RESULT' : null);
  const activeScene = s.scene || 'PLAY';
  const C = (template && (TEMPLATE_COMPONENTS as any)[template]) || (SCENE_COMPONENTS as any)[activeScene] || null;
  const showGraphic = !!template || (activeScene !== 'PLAY' && !!C);
  const sb = s.scorebug || {};
  const scorebugSettings = {
    visible: sb.visible !== false,
    variant: (sb.variant === 'compact' ? 'compact' : sb.variant === 'wide' ? 'wide' : 'classic') as any,
    position: sb.position || 'top-left',
    scale: Number(sb.scale || 1) || 1,
    showSetHistory: !!sb.showSetHistory,
    showPreMatch: !!sb.showPreMatch,
    showLogos: sb.showLogos !== false,
    showTournament: sb.showTournament !== false,
    tournamentLabel: sb.tournamentLabel ?? null,
    theme: sb.theme || s.scorebugTheme?.config || null,
    themeId: sb.themeId || s.scorebugTheme?.id || null,
    themeVersion: sb.themeVersion || s.scorebugTheme?.version || null,
    themeName: sb.themeName || s.scorebugTheme?.name || null,
  };
  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center justify-between mb-1 px-0.5">
        <div className="text-[10px] font-bold tracking-[0.14em] text-fg-muted font-display uppercase">{label}</div>
        {onAir ? <div className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider text-danger"><span className="w-2 h-2 rounded-full bg-danger animate-pulse" />ON AIR</div> : <div className="text-[10px] text-fg-subtle">PREVIEW</div>}
      </div>
      <div className={cn('relative w-full rounded-md overflow-hidden border bg-black', onAir ? 'border-danger/60 shadow-[0_0_0_1px_rgba(239,68,68,0.2)]' : 'border-border')} style={{ aspectRatio: '16 / 9' }}>
        {match ? (
          <ScaledStage fit="container" match={match} hideCursor={false} bg="checker">
            <div style={{ width: 1920, height: 1080, position: 'relative', background: 'transparent' }}>
              <AnimatePresence mode="wait">
                {showGraphic && C ? (
                  <motion.div key={`${template || activeScene}:${s.version ?? 0}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} style={{ position: 'absolute', inset: 0 }}>
                    <C match={match} scene={s} analytics={null} payload={s.payload || {}} template={template} />
                  </motion.div>
                ) : <motion.div key="clear" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0 }} />}
              </AnimatePresence>
              <ScorebugOverlay match={match} settings={scorebugSettings} status={String(match.status || '').toUpperCase()} forceShow={true} />
            </div>
          </ScaledStage>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">No match</div>
        )}
      </div>
      <div className="mt-1 text-[10px] text-fg-muted truncate px-0.5" title={cueLabel(scene?.template ? { template: scene.template } : (scene?.scene === 'PLAY' ? { template: null } : { template: scene?.scene }))}>
        {scene?.template ? String(scene.template).replace(/_/g,' ') : (scene?.scene && scene.scene !== 'PLAY' ? String(scene.scene).replace(/_/g,' ') : 'Scorebug / Clear')}
      </div>
    </div>
  );
};

function mergeScorebugFromServer(prev: any, sb: any) {
  if (!sb) return prev;
  return {
    ...prev,
    visible: sb.visible ?? prev.visible,
    position: sb.position ?? prev.position,
    scale: sb.scale ?? prev.scale,
    variant: sb.variant ?? prev.variant,
    showSetHistory: sb.showSetHistory ?? prev.showSetHistory,
    showPreMatch: sb.showPreMatch ?? prev.showPreMatch,
    showLogos: sb.showLogos ?? prev.showLogos,
    showTournament: sb.showTournament ?? prev.showTournament,
    tournamentLabel: sb.tournamentLabel ?? prev.tournamentLabel ?? '',
  };
}

export const LiveControlPage: React.FC = () => {
  const { id } = useParams();
  const [search, setSearch] = useSearchParams();
  const tab = ((): TabKey => { const t = search.get('tab'); return (t === 'graphics' || t === 'outputs' || t === 'score') ? t : 'score'; })();
  const setTab = (t: TabKey) => { const n = new URLSearchParams(search); n.set('tab', t); setSearch(n, { replace: true }); };

  const notify = useNotification();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { match, isLoading, isError, error } = useMatch(id);
  const socket = getSocket();
  const matchId = match?.id || id || '';

  const [conn, setConn] = useState<Conn>(socket.connected ? 'CONNECTED' : 'OFFLINE');
  const [selectedPlayer, setSelectedPlayer] = useState<{ side: TeamKey; playerId: string } | null>(null);
  const selectionTimer = useRef<number | null>(null);
  const [pendingAttribution, setPendingAttribution] = useState<{ clientEventId: string; team: TeamKey; action: string; eventId?: string | null; suggestedPlayerId?: string | null; expiresAt: number } | null>(null);
  const attributionTimer = useRef<number | null>(null);
  const ATTRIBUTION_WINDOW_MS = Number((import.meta as any).env?.VITE_ATTRIBUTION_WINDOW_MS || 6000);
  const [pendingMap, setPendingMap] = useState<Record<string, PendingState>>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [breakView, setBreakView] = useState(false);
  const [setSummarySet, setSetSummarySet] = useState<number | null>(null);
  const [setSummaryData, setSetSummaryData] = useState<any>(null);
  const [autoSeq, setAutoSeq] = useState<{ active: boolean; phase: 'result' | 'break' | null; setNumber: number | null; hold: boolean; secondsLeft: number }>({ active: false, phase: null, setNumber: null, hold: false, secondsLeft: 0 });
  const autoSeqTimerRef = useRef<any>(null);
  const autoSeqCancelledRef = useRef(false);
  const [startSetOpen, setStartSetOpen] = useState(false);
  const [startSetServing, setStartSetServing] = useState<TeamKey>('A');
  const [endSetEarlyOpen, setEndSetEarlyOpen] = useState(false);
  const [endSetEarlyReason, setEndSetEarlyReason] = useState('');
  const [helpDrawerOpen, setHelpDrawerOpen] = useState(false);
  const [coachStep, setCoachStep] = useState<number>(() => { try { return localStorage.getItem('qwesie.coach.live.v1') === 'done' ? 0 : 1; } catch { return 0; } });
  const [subOpen, setSubOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { type: 'finish'; label: string }>(null);
  const [outputsOpen, setOutputsOpen] = useState(false);
  const [scorebugThemes, setScorebugThemes] = useState<any[]>([]);
  const [subForm, setSubForm] = useState<{ side: TeamKey; outId: string; inId: string }>({ side: 'A', outId: '', inId: '' });
  const [clients, setClients] = useState<{ scorebug: number; graphics: number } | null>(null);
  const [courtOnAir, setCourtOnAirState] = useState<any>(null);
  const [conflict, setConflict] = useState<{ court: string; conflict: CourtConflict; retry?: () => Promise<void> } | null>(null);
  const [nextLineups, setNextLineups] = useState<Record<TeamKey, string[]>>({ A: [], B: [] });
  const [previewState, setPreviewState] = useState<{ cue: Cue | null; version: number }>({ cue: null, version: 0 });
  const [cueBusy, setCueBusy] = useState<null | 'preview' | 'take' | 'clear'>(null);
  const [introReady, setIntroReady] = useState<{ ready: boolean; total: number; loaded: number }>({ ready: false, total: 0, loaded: 0 });
  const [outputAcks, setOutputAcks] = useState<any[]>([]);
  const [graphicsMode, setGraphicsMode] = useState<'direct' | 'preview_take'>(() => {
    try { return (localStorage.getItem('qwesie.graphicsMode') as any) === 'preview_take' ? 'preview_take' : 'direct'; } catch { return 'direct'; }
  });
  const [breakType, setBreakType] = useState<string>('TEAM_A_TIMEOUT');
  const [breakDuration, setBreakDuration] = useState<string>('30');
  const [graphicDuration, setGraphicDuration] = useState<string>('0');
  const [selectedTemplate, setSelectedTemplate] = useState('TEAM_COMPARISON');
  const [scorebugCfg, setScorebugCfg] = useState<any>({ visible: true, position: 'top-left', scale: 1, variant: 'classic', showSetHistory: false, showPreMatch: true, showLogos: true, showTournament: true, tournamentLabel: '' });
  const scorebugDebounceRef = useRef<any>(null);
  const scorebugSeqRef = useRef(0);
  const [scorebugSave, setScorebugSave] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [themeApplying, setThemeApplying] = useState(false);

  const lastTapRef = useRef<Record<string, number>>({});
  const selectTimerRef = useRef<any>(null);
  const queueKey = `qwesie.offlineQueue.${matchId}`;
  const [queue, setQueue] = useState<any[]>(() => { try { return matchId ? JSON.parse(localStorage.getItem(queueKey) || '[]') : []; } catch { return []; } });
  const replayingRef = useRef(false);
  const [obsBaseUrl, setObsBaseUrl] = useState('');

  const socketHealthy = conn === 'CONNECTED' && socket.connected;
  const { data: scene, refetch: refetchScene } = useQuery({
    queryKey: ['output-scene', matchId],
    queryFn: () => broadcastApi.getSceneState(matchId),
    enabled: !!matchId,
    refetchInterval: socketHealthy ? false : 15000,
  });
  const { data: fetchedPreview } = useQuery({
    queryKey: ['output-preview', matchId],
    queryFn: () => broadcastApi.getPreview(matchId),
    enabled: !!matchId,
    refetchInterval: socketHealthy ? false : 15000,
  });
  const { data: templates = [] } = useQuery({ queryKey: ['broadcast-templates'], queryFn: broadcastApi.getTemplates });
  const { data: graphicState, refetch: refetchGraphic } = useQuery({
    queryKey: ['broadcast-graphic', matchId],
    queryFn: () => broadcastApi.getGraphicState(matchId),
    enabled: !!matchId,
    refetchInterval: socketHealthy ? false : 15000,
  });
  const { data: introSeq, refetch: refetchIntroSeq } = useQuery({
    queryKey: ['broadcast-sequence', matchId],
    queryFn: () => broadcastApi.getIntroSequence(matchId!),
    enabled: !!matchId,
    refetchInterval: 1000,
  });

  useEffect(() => { if (fetchedPreview) setPreviewState({ cue: fetchedPreview.cue || null, version: fetchedPreview.version || 0 }); }, [fetchedPreview]);
  useEffect(() => { try { if (matchId) localStorage.setItem(queueKey, JSON.stringify(queue)); } catch {} }, [queue, queueKey, matchId]);
  useEffect(() => { if (scene?.scorebug) setScorebugCfg((prev: any) => mergeScorebugFromServer(prev, scene.scorebug)); }, [scene]);

  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    const load = async () => { try { const info = await systemApi.info(); if (alive) setClients({ scorebug: info.connectedClients.byType.scorebug || 0, graphics: info.connectedClients.byType.graphics || 0 }); } catch {} };
    load(); const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [matchId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const rows = await scorebugThemeApi.list(); if (alive) setScorebugThemes(rows || []); } catch {}
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const c = String(match?.court || '').trim();
    if (!c) { setCourtOnAirState(null); return; }
    let alive = true;
    const load = async () => {
      try { const r = await systemApi.activeCourtMatch(c); if (alive) setCourtOnAirState(r); } catch { if (alive) setCourtOnAirState(null); }
    };
    load(); const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [match?.court, matchId]);

  useEffect(() => {
    let alive = true;
    const loadBase = () => resolveOutputBaseUrl({ forceLan: true }).then(r => { if (alive) setObsBaseUrl(r.baseUrl); }).catch(() => {});
    loadBase();
    const t = setInterval(loadBase, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    let joined = false;
    const joinConsole = () => {
      if (!matchId || !socket.connected) return;
      socket.emit(SOCKET_EVENTS.MATCH_JOIN, { matchId, clientType: 'console' });
      joined = true;
    };
    const onConnect = () => { setConn('CONNECTED'); joinConsole(); void replayQueue(); };
    const onDisconnect = () => setConn('OFFLINE');
    const onReconnecting = () => setConn('RECONNECTING');
    const onScene = (s: any) => { if (s?.matchId === matchId) { qc.setQueryData(['output-scene', matchId], s); void refetchScene(); } };
    const onPreview = (p: any) => { if (p?.matchId === matchId) setPreviewState({ cue: p.cue || null, version: p.version || 0 }); };
    const onGraphic = (g: any) => { if (!g || (g.matchId && g.matchId !== matchId)) return; qc.setQueryData(['broadcast-graphic', matchId], g); };
    const onAck = (p: any) => { if (p?.matchId === matchId) setOutputAcks(Array.isArray(p.acks) ? p.acks : []); };
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnecting as any);
    socket.on(SOCKET_EVENTS.OUTPUT_SCENE_STATE as any, onScene);
    socket.on((SOCKET_EVENTS as any).OUTPUT_PREVIEW_STATE as any, onPreview);
    socket.on('output:preview:state' as any, onPreview);
    socket.on(SOCKET_EVENTS.BROADCAST_GRAPHIC_STATE as any, onGraphic);
    socket.on((SOCKET_EVENTS as any).OUTPUT_ACK_STATE as any, onAck);
    setConn(socket.connected ? 'CONNECTED' : 'OFFLINE');
    joinConsole();
    return () => {
      socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.io.off('reconnect_attempt', onReconnecting as any);
      socket.off(SOCKET_EVENTS.OUTPUT_SCENE_STATE as any, onScene);
      socket.off((SOCKET_EVENTS as any).OUTPUT_PREVIEW_STATE as any, onPreview);
      socket.off('output:preview:state' as any, onPreview);
      socket.off(SOCKET_EVENTS.BROADCAST_GRAPHIC_STATE as any, onGraphic);
      socket.off((SOCKET_EVENTS as any).OUTPUT_ACK_STATE as any, onAck);
      try { if (joined && matchId) socket.emit(SOCKET_EVENTS.MATCH_LEAVE, matchId); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, matchId]);

  useEffect(() => {
    if (!match) return;
    const shouldBreak = match.status === 'BETWEEN_SETS' || match.flags?.setWon != null || match.flags?.pendingEnd || (scene?.scene && scene.scene !== 'PLAY' && ['SET_BREAK','TIMEOUT','BREAK_SLATE','MATCH_STATS','LINEUPS'].includes(scene.scene));
    if (shouldBreak) setBreakView(true);
    if (scene?.scene === 'PLAY' && match.status === 'LIVE' && !match.flags?.pendingEnd) setBreakView(false);
  }, [scene?.scene, match?.status, match?.flags?.setWon, match?.flags?.pendingEnd]);

  useEffect(() => {
    if (!matchId || !setSummarySet) { setSetSummaryData(null); return; }
    let alive = true;
    (async () => {
      try {
        const report: any = await matchApi.getMatchReport(matchId);
        if (alive) setSetSummaryData(report);
      } catch { if (alive) setSetSummaryData(null); }
    })();
    return () => { alive = false; };
  }, [matchId, setSummarySet]);

  useEffect(() => {
    if (!match) return;
    if (match.status === 'BETWEEN_SETS' || breakView) {
      setNextLineups({
        A: (match.teams.A.lineup || []).slice(0,6).map((p: any) => String(p.id || '')).filter(Boolean),
        B: (match.teams.B.lineup || []).slice(0,6).map((p: any) => String(p.id || '')).filter(Boolean),
      });
    }
  }, [match?.status, match?.current_set, breakView]);

  const clearSelectionLater = useCallback((ms = 12000) => {
    if (selectTimerRef.current) clearTimeout(selectTimerRef.current);
    selectTimerRef.current = setTimeout(() => setSelectedPlayer(null), ms);
  }, []);
  useEffect(() => () => { if (selectTimerRef.current) clearTimeout(selectTimerRef.current); if (scorebugDebounceRef.current) clearTimeout(scorebugDebounceRef.current); if (autoSeqTimerRef.current) clearTimeout(autoSeqTimerRef.current); }, []);

  const setPending = (k: string, v: PendingState) => setPendingMap(p => ({ ...p, [k]: v }));
  const debounced = (key: string, ms = 350) => {
    const now = Date.now();
    const last = lastTapRef.current[key] || 0;
    if (now - last < ms) return false;
    lastTapRef.current[key] = now; return true;
  };

  const enqueue = (op: any) => setQueue(q => [...q, op]);
  const runOp = useCallback(async (op: any) => {
    if (!matchId) return;
    setPending(op.key, 'pending');
    const prev = qc.getQueryData<any>(['match', matchId]);
    const applyOptimistic = () => {
      if (!prev) return;
      if (op.kind === 'point') {
        const team = op.team as TeamKey; const cur = prev.current_set || 1; const idx = Math.max(0, Math.min(4, cur - 1));
        const delta = op.delta ?? 1;
        const nextScores = { A: [...(prev.set_scores?.A || [0,0,0,0,0])], B: [...(prev.set_scores?.B || [0,0,0,0,0])] };
        nextScores[team][idx] = Math.max(0, (nextScores[team][idx] || 0) + delta);
        qc.setQueryData(['match', matchId], { ...prev, teams: { ...prev.teams, [team]: { ...prev.teams[team], score: Math.max(0, (prev.teams?.[team]?.score || 0) + delta) } }, set_scores: nextScores, server: delta > 0 ? team : prev.server, perf: { ...(prev.perf || {}), source: 'cache', optimisticAt: new Date().toISOString() } });
      } else if (op.kind === 'action') {
        const action = String(op.action || '').toUpperCase();
        const scoring = ['KILL','ACE','BLOCK'].includes(action);
        const attackErr = action === 'ATTACK_ERROR';
        const team = (scoring ? op.team : attackErr ? (op.team === 'A' ? 'B' : 'A') : null) as TeamKey | null;
        if (team) {
          const cur = prev.current_set || 1; const idx = Math.max(0, Math.min(4, cur - 1));
          const nextScores: { A: number[]; B: number[] } = { A: [...(prev.set_scores?.A || [0,0,0,0,0])], B: [...(prev.set_scores?.B || [0,0,0,0,0])] };
          nextScores[team][idx] = Math.max(0, (nextScores[team][idx] || 0) + 1);
          qc.setQueryData(['match', matchId], { ...prev, teams: { ...prev.teams, [team]: { ...prev.teams[team], score: Math.max(0, (prev.teams?.[team]?.score || 0) + 1) } }, set_scores: nextScores, server: team, perf: { ...(prev.perf || {}), source: 'cache', optimisticAt: new Date().toISOString() } });
        }
      }
    };
    applyOptimistic();
    try {
      let state: any = null;
      if (op.kind === 'point') state = await matchApi.point({ team: op.team, delta: op.delta ?? 1, clientEventId: op.clientEventId }, matchId);
      else if (op.kind === 'action') state = await matchApi.action({ team: op.team, action: op.action, playerId: op.playerId, clientEventId: op.clientEventId }, matchId);
      else if (op.kind === 'timeout') state = await matchApi.timeout({ team: op.team, clientEventId: op.clientEventId }, matchId);
      else if (op.kind === 'sub') state = await matchApi.substitution({ team: op.team, playerOutId: op.outId, playerInId: op.inId, clientEventId: op.clientEventId }, matchId);
      else if (op.kind === 'undo') state = await matchApi.undo(matchId, op.clientEventId);
      else if (op.kind === 'startSet') state = await matchApi.startSet(matchId, { setNumber: op.setNumber, servingSide: op.servingSide });
      else if (op.kind === 'endSet') state = await matchApi.endSet(matchId, { force: !!op.force, reason: op.reason });
      else if (op.kind === 'status') state = await matchApi.setStatus(op.status, matchId);
      if (state) { qc.setQueryData(['match', matchId], state); }
      setPending(op.key, 'sent'); window.setTimeout(() => setPending(op.key, 'idle'), 600);
      return state;
    } catch (e: any) {
      if (prev) qc.setQueryData(['match', matchId], prev);
      setPending(op.key, 'failed');
      const c = getCourtConflict(e);
      if (c && (op.kind === 'status' && op.status === 'LIVE')) {
        setConflict({ court: String(match?.court || c.court || '1'), conflict: c, retry: async () => { await runOp(op); } });
      } else if (!op.silentError) {
        notify.error(e?.message || 'Action failed');
      }
      throw e;
    }
  }, [matchId, notify, qc, match?.court]);

  const send = useCallback(async (op: any) => {
    if (!matchId) return;
    if (!socket.connected && !['endSet','startSet','status','undo'].includes(op.kind)) { enqueue(op); setPending(op.key, 'queued'); notify.info('Offline: queued action'); return; }
    try { return await runOp(op); } catch { if (!socket.connected) enqueue(op); }
  }, [matchId, socket, runOp, notify]);

  const replayQueue = useCallback(async () => {
    if (replayingRef.current || !socket.connected || !matchId) return;
    replayingRef.current = true;
    try {
      const current = (() => { try { return JSON.parse(localStorage.getItem(queueKey) || '[]'); } catch { return []; } })();
      const remaining: any[] = [];
      for (const op of current) { try { await runOp({ ...op, silentError: true }); } catch { remaining.push(op); } }
      setQueue(remaining);
      if (current.length && !remaining.length) notify.success('Queued actions replayed');
    } finally { replayingRef.current = false; }
  }, [socket, matchId, queueKey, runOp, notify]);

  const setPendingEnd = !!match?.flags?.pendingEnd;
  const setStarted = match?.status === 'LIVE' || match?.status === 'PAUSED' || match?.status === 'SUSPENDED';
  const scoringLocked = !match || match.status !== 'LIVE' || setPendingEnd;
  const clearAttributionWindow = useCallback(() => {
    if (attributionTimer.current) { window.clearTimeout(attributionTimer.current); attributionTimer.current = null; }
    setPendingAttribution(null);
  }, []);

  const startAttributionWindow = useCallback((clientEventId: string, team: TeamKey, action: string, eventId?: string | null, suggestedPlayerId?: string | null) => {
    if (attributionTimer.current) window.clearTimeout(attributionTimer.current);
    setPendingAttribution({ clientEventId, team, action, eventId: eventId || null, suggestedPlayerId: suggestedPlayerId || null, expiresAt: Date.now() + ATTRIBUTION_WINDOW_MS });
    attributionTimer.current = window.setTimeout(() => { setPendingAttribution(null); attributionTimer.current = null; }, ATTRIBUTION_WINDOW_MS) as any;
  }, [ATTRIBUTION_WINDOW_MS]);

  const pushAttributionOnAir = useCallback(async (team: TeamKey, playerId: string, action: string, force = false) => {
    if (!matchId || !match) return;
    const setting = (scene?.autoTriggers as any)?.attributionOnAir || 'off';
    if (!force && setting !== 'auto') return;
    if (setting === 'off' && !force) return;
    const p: any = (match.teams?.[team]?.lineup || []).find((x: any) => String(x.id) === String(playerId))
      || (match.teams?.[team]?.bench || []).find((x: any) => String(x.id) === String(playerId));
    try {
      await broadcastApi.setGraphicState(matchId, {
        template: 'PLAYER_ACTION',
        visible: true,
        durationSeconds: 5,
        payload: {
          team,
          playerId,
          playerName: p?.name || null,
          jerseyNumber: p?.jerseyNumber ?? null,
          photoUrl: p?.thumbUrl || p?.photoUrl || null,
          action: String(action).toUpperCase(),
        },
      });
      await refetchScene();
    } catch (e) {
      console.warn('Failed to push attribution on air', e);
    }
  }, [matchId, match, scene?.autoTriggers, refetchScene]);

  const attributePendingToPlayer = useCallback(async (side: TeamKey, playerId: string) => {
    if (!matchId || !pendingAttribution || pendingAttribution.team !== side) return false;
    const evId = pendingAttribution.eventId || (match?.events || []).find((e: any) => e.clientEventId === pendingAttribution.clientEventId)?.id;
    if (!evId) return false;
    try {
      const state = await matchApi.attributeEvent(matchId, String(evId), { playerId });
      qc.setQueryData(['match', matchId], state);
      const actionName = pendingAttribution.action;
      clearAttributionWindow();
      notify.success('Player attributed');
      void pushAttributionOnAir(side, playerId, actionName);
      return true;
    } catch (e: any) {
      notify.error(e?.message || 'Failed to attribute player');
      return false;
    }
  }, [matchId, pendingAttribution, match?.events, qc, clearAttributionWindow, notify, pushAttributionOnAir]);

  const onPoint = (team: TeamKey) => { if (scoringLocked) return; if (!debounced(`pt-${team}`)) return; const clientEventId = uuid(); setSelectedPlayer(null); startAttributionWindow(clientEventId, team, 'POINT'); void send({ kind: 'point', key: `pt-${team}`, team, clientEventId }); };
  const onAction = (team: TeamKey, action: string) => {
    if (scoringLocked) return;
    const upper = String(action).toUpperCase();
    let playerId = selectedPlayer?.side === team ? selectedPlayer.playerId : undefined;
    // Aces suggest the server (P1 = rotation position 1)
    let suggestedPlayerId: string | undefined;
    if (!playerId && upper === 'ACE') {
      const p1 = match?.teams?.[team]?.lineup?.[0];
      if (p1?.id) suggestedPlayerId = String(p1.id);
    }
    if (!playerId && upper === 'BLOCK') {
      // Blocks allow choosing the blocker - leave unattributed for quick pick
      suggestedPlayerId = undefined;
    }
    const dedupeKey = `act-${team}-${upper}-${playerId||'team'}`; if (!debounced(dedupeKey)) return;
    const clientEventId = uuid();
    void send({ kind: 'action', key: dedupeKey, team, action: upper, playerId, clientEventId });
    if (playerId) {
      clearSelectionLater(12000);
      void pushAttributionOnAir(team, playerId, upper);
    } else if (['ACE','KILL','BLOCK','ATTACK_ERROR','POINT'].includes(upper)) {
      startAttributionWindow(clientEventId, team, upper, null, suggestedPlayerId);
    }
  };
  const canMinus = (team: TeamKey) => !!match && match.status === 'LIVE' && !setPendingEnd && (match.teams?.[team]?.score || 0) > 0;
  const onCorrection = (team: TeamKey, delta: -1) => {
    if (!canMinus(team)) return;
    if (!debounced(`pt-${team}-${delta}`)) return;
    const clientEventId = uuid();
    void send({ kind: 'point', key: `pt-${team}-minus`, team, delta, clientEventId })
      .then(() => notify.info('Manual score correction applied.', { title: '-1 correction', action: { label: 'Undo', onClick: () => onUndo() }, durationMs: 6000 }))
      .catch(() => {});
  };
  const onTimeout = (team: TeamKey) => { if (!match || match.status !== 'LIVE' || setPendingEnd) return; if (!debounced(`to-${team}`)) return; void send({ kind: 'timeout', key: `to-${team}`, team, clientEventId: uuid() }); };
  const lastUndoLabel = useMemo(() => describeUndo((match?.events || [])[0], match), [match]);
  const onUndo = (clientEventId?: string) => { if (!debounced(`undo-${clientEventId||'last'}`)) return; void send({ kind: 'undo', key: 'undo', clientEventId: clientEventId || uuid() }); };

  const loadPreview = useCallback(async (cue: Cue) => {
    if (!matchId) return;
    setCueBusy('preview');
    try {
      const res = await broadcastApi.setPreview(matchId, cue);
      setPreviewState({ cue: res?.cue || cue, version: res?.version || Date.now() });
      if (graphicsMode === 'direct') {
        setCueBusy('take');
        const taken = await broadcastApi.take(matchId);
        if (taken?.scene) qc.setQueryData(['output-scene', matchId], taken.scene);
        await refetchScene();
      }
    } catch (e: any) { notify.error(e?.message || (graphicsMode === 'direct' ? 'Failed to send to program' : 'Failed to load preview')); }
    finally { setCueBusy(null); }
  }, [matchId, notify, graphicsMode, qc, refetchScene]);

  const takePreview = useCallback(async () => {
    if (!matchId) return;
    setCueBusy('take');
    try {
      const res = await broadcastApi.take(matchId);
      if (res?.scene) qc.setQueryData(['output-scene', matchId], res.scene);
      await refetchScene();
    } catch (e: any) { notify.error(e?.message || 'Failed to take to program'); }
    finally { setCueBusy(null); }
  }, [matchId, qc, refetchScene, notify]);

  const clearProgram = useCallback(async () => {
    if (!matchId) return;
    setCueBusy('clear');
    try {
      const res = await broadcastApi.clear(matchId);
      if (res?.scene) qc.setQueryData(['output-scene', matchId], res.scene);
      await refetchScene();
    } catch (e: any) { notify.error(e?.message || 'Failed to clear program'); }
    finally { setCueBusy(null); }
  }, [matchId, qc, refetchScene, notify]);

  const onSetScene = async (sceneName: string) => { if (!matchId) return; try { await broadcastApi.setScene(matchId, { scene: sceneName }); await refetchScene(); } catch(e:any){ notify.error(e.message);} };
  const onToggleLock = async () => { if (!matchId) return; try { await broadcastApi.setScene(matchId, { lock: !scene?.lock }); await refetchScene(); } catch(e:any){ notify.error(e.message);} };
  const currentSetNumber = match?.current_set || 1;
  const rules = match?.rules;
  const isDeciding = !!match?.flags?.isDecidingSet;
  const targetPoints = isDeciding ? (rules?.finalSetPoints || 15) : (rules?.regularSetPoints || 25);
  const minDiff = rules?.minPointDifference || 2;
  const curA = match?.teams?.A?.score || 0;
  const curB = match?.teams?.B?.score || 0;
  const setCanEnd = Math.max(curA, curB) >= targetPoints && Math.abs(curA - curB) >= minDiff;
  const setWinnerSide: TeamKey | null = !setCanEnd ? null : (curA > curB ? 'A' : 'B');
  const pendingEndFlag = !!match?.flags?.pendingEnd;

  const clearAutoSeqTimer = useCallback(() => { if (autoSeqTimerRef.current) { clearTimeout(autoSeqTimerRef.current); autoSeqTimerRef.current = null; } }, []);

  const cancelAutoSequence = useCallback(async (opts?: { unlock?: boolean }) => {
    autoSeqCancelledRef.current = true;
    clearAutoSeqTimer();
    setAutoSeq({ active: false, phase: null, setNumber: null, hold: false, secondsLeft: 0 });
    if (opts?.unlock && matchId) { try { await broadcastApi.setScene(matchId, { lock: false }); await refetchScene(); } catch {} }
  }, [clearAutoSeqTimer, matchId, refetchScene]);

  const buildSetStatsPayload = useCallback((setNumber: number, report?: any) => {
    const analytics = report?.analytics;
    const bySet = Array.isArray(analytics?.bySet) ? analytics.bySet.find((s: any) => s?.setNumber === setNumber) : null;
    const teams = bySet?.teams || null;
    const players = bySet?.players || null;
    const pickTop = (side: 'HOME'|'AWAY') => {
      const list = Array.isArray(players?.[side]) ? players[side] : [];
      return [...list]
        .map((p: any) => ({ name: p.name, jerseyNumber: p.jerseyNumber, points: Number(p.points||0), kills: Number(p.attackKills||0), aces: Number(p.serviceAces||0), blocks: Number(p.blocks||0), digs: Number(p.digs||0), errors: Number(p.attackErrors||0) + Number(p.serviceErrors||0) + Number(p.receptionErrors||0) }))
        .sort((a,b) => b.points - a.points || b.kills - a.kills || b.aces - a.aces)
        .slice(0, 3);
    };
    const summary = (side: 'HOME'|'AWAY') => {
      const t = teams?.[side];
      if (!t) return null;
      return {
        points: t.totalPoints ?? 0,
        kills: t.totalAttackKills ?? 0,
        attackErrors: t.attackErrors ?? 0,
        blocks: t.blockingPoints ?? 0,
        aces: t.serviceAces ?? 0,
        serviceErrors: t.serviceErrors ?? 0,
        errors: t.errors ?? 0,
        attackEfficiency: t.attackEfficiency ?? null,
        sideOutPct: t.sideOutPercentage ?? null,
        receptionEfficiency: t.receptionEfficiency ?? null,
        timeoutsUsed: t.timeoutsUsed ?? 0,
        substitutionsUsed: t.substitutionsUsed ?? 0,
      };
    };
    const hist = (match?.setHistory || []).find((s: any) => s.number === setNumber);
    return {
      setNumber,
      scoreA: hist?.scoreA ?? (setNumber === match?.current_set ? match?.teams?.A?.score : 0),
      scoreB: hist?.scoreB ?? (setNumber === match?.current_set ? match?.teams?.B?.score : 0),
      winner: hist?.winner ?? null,
      teams: { A: summary('HOME'), B: summary('AWAY') },
      topScorers: { A: pickTop('HOME'), B: pickTop('AWAY') },
    };
  }, [match]);

  const runAutoSequenceAfterSetEnd = useCallback(async (setNumber: number) => {
    const settings = loadSettings();
    if (settings.match.autoSequenceAfterSetEnd === false) return;
    const seconds = Math.max(3, Math.min(30, Number(settings.match.autoSequenceResultSeconds) || 8));
    autoSeqCancelledRef.current = false;
    clearAutoSeqTimer();

    let report: any = setSummaryData;
    if (!report) { try { report = await matchApi.getMatchReport(matchId); setSetSummaryData(report); } catch {} }
    const setStats = buildSetStatsPayload(setNumber, report);

    try { await broadcastApi.setScene(matchId, { lock: true }); } catch {}
    await loadPreview({ template: 'SET_RESULT', payload: { setNumber, setStats }, autoReturn: false });
    setAutoSeq({ active: true, phase: 'result', setNumber, hold: false, secondsLeft: seconds });

    const tick = (left: number) => {
      if (autoSeqCancelledRef.current) return;
      setAutoSeq(prev => prev.hold ? prev : { ...prev, secondsLeft: left });
      if (left <= 0) {
        void (async () => {
          if (autoSeqCancelledRef.current) return;
          setAutoSeq(prev => ({ ...prev, phase: 'break', secondsLeft: 0 }));
          try { await broadcastApi.setScene(matchId, { lock: false }); } catch {}
          try { await broadcastApi.startBreak(matchId, { type: 'BETWEEN_SET', durationSeconds: Number(breakDuration) || 20 }); } catch {}
          await refetchScene(); await refetchGraphic();
          setAutoSeq(prev => ({ ...prev, active: true, phase: 'break' }));
        })();
        return;
      }
      autoSeqTimerRef.current = setTimeout(() => {
        if (autoSeqCancelledRef.current) return;
        setAutoSeq(prev => {
          if (prev.hold) { autoSeqTimerRef.current = setTimeout(() => tick(left), 400); return prev; }
          tick(left - 1);
          return prev;
        });
      }, 1000);
    };
    clearAutoSeqTimer();
    autoSeqTimerRef.current = setTimeout(() => tick(seconds - 1), 1000);
  }, [breakDuration, buildSetStatsPayload, clearAutoSeqTimer, loadPreview, matchId, refetchGraphic, refetchScene, setSummaryData]);

  const skipAutoSequence = useCallback(async () => {
    const setNumber = autoSeq.setNumber || setSummarySet || currentSetNumber;
    autoSeqCancelledRef.current = true;
    clearAutoSeqTimer();
    setAutoSeq({ active: true, phase: 'break', setNumber, hold: false, secondsLeft: 0 });
    try { await broadcastApi.setScene(matchId, { lock: false }); } catch {}
    try { await broadcastApi.startBreak(matchId, { type: 'BETWEEN_SET', durationSeconds: Number(breakDuration) || 20 }); } catch {}
    await refetchScene(); await refetchGraphic();
  }, [autoSeq.setNumber, breakDuration, clearAutoSeqTimer, currentSetNumber, matchId, refetchGraphic, refetchScene, setSummarySet]);

  const toggleAutoSequenceHold = useCallback(() => {
    setAutoSeq(prev => ({ ...prev, hold: !prev.hold }));
  }, []);

  const onEndSet = async (opts?: { force?: boolean; reason?: string }) => {
    const key = opts?.force ? 'endset-early' : 'endset';
    if (!debounced(key, 500)) return;
    const endingSet = currentSetNumber;
    const settings = loadSettings();
    try {
      await cancelAutoSequence({ unlock: false });
      if (settings.match.autoSequenceAfterSetEnd !== false) {
        try { await broadcastApi.setScene(matchId, { lock: true }); } catch {}
      }
      await send({ kind:'endSet', key, clientEventId: uuid(), force: !!opts?.force, reason: opts?.reason });
      setSetSummarySet(endingSet);
      setBreakView(true);
      if (settings.match.autoSequenceAfterSetEnd !== false) void runAutoSequenceAfterSetEnd(endingSet);
    } catch {
      if (settings.match.autoSequenceAfterSetEnd !== false) { try { await broadcastApi.setScene(matchId, { lock: false }); } catch {} }
    }
  };
  const onResumeMatch = async () => {
    if (!matchId) return;
    try {
      const res = await broadcastApi.resumeMatch(matchId);
      if (res?.scene) qc.setQueryData(['output-scene', matchId], res.scene);
      if (res?.match) { qc.setQueryData(['match', matchId], res.match); }
      setBreakView(false);
      await refetchScene();
    } catch (e: any) { notify.error(e.message || 'Failed to resume match'); }
  };
  const openStartSetDialog = () => {
    if (!match) return;
    const suggested = match.server || (match.setHistory?.slice(-1)[0]?.winner as TeamKey) || 'A';
    setStartSetServing(suggested as TeamKey);
    setStartSetOpen(true);
  };
  const confirmStartSet = async () => {
    if (!matchId || !match) return;
    try {
      const nextSet = match.status === 'BETWEEN_SETS' ? match.current_set : (match.current_set || 1);
      for (const side of ['A','B'] as const) {
        const ids = nextLineups[side].filter(Boolean);
        if (ids.length === 6) {
          await lineupApi.set(matchId, side, nextSet, { players: ids.map((playerId, i) => ({ rotationPos: i + 1, playerId })) });
          const teamId = match.teams[side]?.id;
          if (teamId) {
            try { localStorage.setItem(`qwesie:last-lineup:${teamId}`, JSON.stringify(assignmentsFromArray(ids))); } catch {}
          }
        }
      }
      await send({ kind: 'startSet', key: `startset-${nextSet}`, setNumber: nextSet, servingSide: startSetServing, clientEventId: uuid() });
      setStartSetOpen(false);
      setSetSummarySet(null);
      setBreakView(false);
    } catch (e: any) { notify.error(e?.message || 'Failed to start set'); }
  };
  const onStartSet = async () => { openStartSetDialog(); };

  // Graphics-tab mutations / actions
  const activateTemplate = async (template: string) => {
    if (!matchId) return;
    try {
      await broadcastApi.setGraphicState(matchId, { template, visible: true, durationSeconds: Number(graphicDuration) || null, payload: (graphicState?.breakState?.active ? { breakType: graphicState.breakState.type, breakLabel: graphicState.breakState.label } : {}) });
      await refetchGraphic(); await refetchScene();
      notify.success(`Graphic updated: ${String(template).replace(/_/g, ' ')}`);
    } catch (e: any) { notify.error(e?.message || 'Failed to activate graphic'); }
  };
  const dismissGraphic = async () => {
    if (!matchId) return;
    try { await broadcastApi.dismissGraphic(matchId); await refetchGraphic(); await refetchScene(); notify.info('Graphic dismissed'); }
    catch (e: any) { notify.error(e?.message || 'Failed to dismiss'); }
  };
  const startBreak = async () => {
    if (!matchId) return;
    try { await broadcastApi.startBreak(matchId, { type: breakType, durationSeconds: Number(breakDuration) || null }); await refetchGraphic(); await refetchScene(); notify.success('Break started'); }
    catch (e: any) { notify.error(e?.message || 'Failed to start break'); }
  };
  const endBreak = async () => {
    if (!matchId) return;
    try { await broadcastApi.endBreak(matchId); await refetchGraphic(); await refetchScene(); notify.info('Break ended'); }
    catch (e: any) { notify.error(e?.message || 'Failed to end break'); }
  };

  const applyScorebugNow = useCallback(async (nextCfg: any) => {
    if (!matchId) return;
    const seq = ++scorebugSeqRef.current;
    setScorebugSave('saving');
    try {
      const res = await broadcastApi.setScene(matchId, { scorebug: {
        visible: !!nextCfg.visible, position: nextCfg.position, scale: Number(nextCfg.scale)||1, variant: nextCfg.variant,
        showSetHistory: !!nextCfg.showSetHistory, showPreMatch: nextCfg.showPreMatch !== false, showLogos: nextCfg.showLogos !== false, showTournament: nextCfg.showTournament !== false, tournamentLabel: nextCfg.tournamentLabel ?? ''
      } });
      if (scorebugSeqRef.current !== seq) return;
      qc.setQueryData(['output-scene', matchId], res);
      if (res?.scorebug) setScorebugCfg((p: any) => mergeScorebugFromServer(p, res.scorebug));
      setScorebugSave('saved'); setTimeout(() => { if (scorebugSeqRef.current === seq) setScorebugSave('idle'); }, 1200);
    } catch (e: any) { if (scorebugSeqRef.current === seq) setScorebugSave('error'); notify.error(e?.message || 'Failed to apply scorebug'); }
  }, [matchId, qc, notify]);

  const updateScorebug = useCallback((patch: any) => {
    setScorebugCfg((prev: any) => {
      const next = { ...prev, ...patch };
      if (scorebugDebounceRef.current) clearTimeout(scorebugDebounceRef.current);
      scorebugDebounceRef.current = setTimeout(() => void applyScorebugNow(next), 300);
      return next;
    });
  }, [applyScorebugNow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (helpOpen || subOpen || confirm) return;
      if (!match) return;
      const k = e.key.toLowerCase();
      if (k === 'q') onPoint('A');
      if (k === 'w') onPoint('B');
      if (k === 'z') onUndo();
      if (k === 'e') { if (setCanEnd || pendingEndFlag) void onEndSet(); else if (match?.status === 'LIVE') { setEndSetEarlyReason(''); setEndSetEarlyOpen(true); } }
      if (e.key >= '1' && e.key <= '7') {
        if (tab === 'graphics') { const btn = SCENE_BTNS.find(b => b.key === e.key); if (btn) { e.preventDefault(); void loadPreview(btn.cue); } }
        else {
          const idx = Number(e.key) - 1;
          const ctxSide = pendingAttribution?.team || selectedPlayer?.side || (match.server as TeamKey) || 'A';
          const p = match.teams[ctxSide]?.lineup?.[idx];
          if (p?.id) { e.preventDefault(); const pid = String(p.id); if (pendingAttribution && pendingAttribution.team === ctxSide) { void attributePendingToPlayer(ctxSide, pid); } else { setSelectedPlayer({ side: ctxSide, playerId: pid }); clearSelectionLater(12000); } }
        }
      }
      if (k === 'a' && tab === 'score') { e.preventDefault(); const side = pendingAttribution?.team || selectedPlayer?.side || (match.server as TeamKey) || 'A'; onAction(side, 'ACE'); }
      if (k === 'k' && tab === 'score') { e.preventDefault(); const side = pendingAttribution?.team || selectedPlayer?.side || (match.server as TeamKey) || 'A'; onAction(side, 'KILL'); }
      if (k === 'b' && tab === 'score') { e.preventDefault(); const side = pendingAttribution?.team || selectedPlayer?.side || (match.server as TeamKey) || 'A'; onAction(side, 'BLOCK'); }
      if (e.key === 'Enter') { e.preventDefault(); void takePreview(); }
      if (e.key === 'Escape') { e.preventDefault(); void clearProgram(); }
      if (e.key === 'F1') { e.preventDefault(); onTimeout('A'); } if (e.key === 'F2') { e.preventDefault(); onTimeout('B'); }
      if (e.key === '!') onTimeout('A'); if (e.key === '@') onTimeout('B');
      if (e.key === '?' || k === '?') setHelpDrawerOpen(true);
      if (k === 'o') { e.preventDefault(); setTab('outputs'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, scene, helpOpen, subOpen, confirm, selectedPlayer, socket.connected, nextLineups, loadPreview, takePreview, clearProgram, tab, setCanEnd, pendingEndFlag, onEndSet]);

  const lastEvents = useMemo(() => (match?.events || []).slice(0, 5), [match?.events]);
  const whyNoPlay = !match ? 'No match loaded' : match.status === 'COMPLETED' ? 'Match completed' : match.status === 'CANCELLED' ? 'Match cancelled' : match.status === 'SCHEDULED' || match.status === 'READY' ? 'Start a set to begin scoring' : match.status === 'BETWEEN_SETS' ? 'Between sets (start next set)' : match.status === 'PAUSED' || match.status === 'SUSPENDED' ? `Match ${match.status.toLowerCase()}` : pendingEndFlag ? 'Set won - end the set or undo' : '';
  const canPlay = !!match && match.status === 'LIVE' && !pendingEndFlag;
  const court = String(match?.court || '').trim() || '1';
  const obsBase = obsBaseUrl || window.location.origin;
  const obsUrls = {
    scorebug: buildCourtOutputUrl(obsBase, court, 'scorebug'),
    graphics: buildCourtOutputUrl(obsBase, court, 'graphics'),
    all: buildCourtOutputUrl(obsBase, court, 'all'),
  };

  if (isLoading) return (
    <div className="h-[calc(100vh-8.5rem)] bg-background text-fg flex flex-col overflow-hidden animate-pulse p-3 space-y-3">
      <div className="h-10 w-full max-w-md bg-surface rounded-xl border border-border" />
      <div className="flex-1 grid grid-cols-3 gap-3"><div className="bg-surface border border-border rounded-xl" /><div className="bg-surface border border-border rounded-xl" /><div className="bg-surface border border-border rounded-xl" /></div>
    </div>
  );
  if (isError || !match) return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 bg-background text-fg p-6 rounded-xl border border-border">
      <div className="text-xl font-bold">Live control unavailable</div>
      <div className="text-fg-muted text-sm">{(error as Error)?.message || 'No match loaded'}</div>
      <Button onClick={()=>window.location.reload()}>Retry</Button>
    </div>
  );

  const A = match.teams.A, B = match.teams.B;
  const flagChip = match.flags?.matchPoint ? `MATCH POINT ${match.flags.matchPoint}` : match.flags?.setPoint ? `SET POINT ${match.flags.setPoint}` : null;
  const onAir = clients ? { sb: clients.scorebug > 0, gfx: clients.graphics > 0 } : { sb: false, gfx: false };
  const programOnAir = !!(scene?.template || (scene?.scene && scene.scene !== 'PLAY'));
  const onAirMatch = courtOnAir?.match || null;
  const onAirMatchId = courtOnAir?.matchId || onAirMatch?.id || null;
  const onAirLabel = onAirMatch ? `#${onAirMatch.matchNumber || '?'} ${onAirMatch.homeTeamName || 'Home'} vs ${onAirMatch.awayTeamName || 'Away'}` : null;
  const consoleDiffersFromOnAir = !!(onAirMatchId && matchId && onAirMatchId !== matchId);
  const previewScene = sceneFromCue(previewState.cue);
  const breakState = graphicState?.breakState;
  const breakActive = !!breakState?.active;
  const suggested = (breakState?.suggestedTemplates || []) as string[];

  const renderTeamHalf = (side: TeamKey) => {
    const team = side === 'A' ? A : B;
    const color = side === 'A' ? 'text-teamA' : 'text-teamB';
    const bg = side === 'A' ? 'bg-teamA hover:bg-teamA/90' : 'bg-teamB hover:bg-teamB/90';
    const border = side === 'A' ? 'border-teamA/30' : 'border-teamB/30';
    const lineup = Array.isArray(team.lineup) ? team.lineup : [];
    const bench = Array.isArray(team.bench) ? team.bench : [];
    const pipsTotal = team.timeoutsPerSet ?? match.rules?.timeoutsPerSet ?? 2;
    const pipsLeft = Math.max(0, pipsTotal - (team.timeoutsUsed ?? 0));
    const subsPerSet = team.substitutionsPerSet ?? match.rules?.substitutionsPerSet ?? 6;
    const subsUsed = team.substitutionsUsed ?? 0;
    const toDisabled = !canPlay || pipsLeft <= 0;
    return (
      <section className={cn('flex flex-col min-h-0 rounded-xl border bg-surface p-2 gap-1.5', border)}>
        <div className="flex items-center justify-between gap-2">
          <div className={cn('font-black text-base md:text-lg tracking-tight truncate', color)} title={team.name}>{team.shortName || team.name}</div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-[11px] text-fg-muted">TO {team.timeoutsUsed ?? 0}/{pipsTotal}</div>
            <Button size="sm" variant="outline" onClick={()=>onTimeout(side)} disabled={toDisabled}>Timeout</Button>
          </div>
        </div>
        <div className="grid grid-cols-[72px_1fr] gap-1.5">
          <Button variant="outline" onClick={()=>onCorrection(side, -1)} disabled={!canMinus(side)} title={canMinus(side) ? '-1 manual correction' : 'Cannot remove point now'} className="h-14 md:h-16 text-2xl font-black">-1</Button>
          <Button variant="secondary" onClick={()=>onPoint(side)} disabled={!canPlay} title={!canPlay ? whyNoPlay : `+1 point`} className={cn('h-14 md:h-16 text-4xl font-black text-accent-fg border-0 shadow-lg', bg)}>+1</Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {lineup.slice(0,6).map((p: any, idx: number) => {
            const pid = String(p?.id || '');
            const sel = selectedPlayer?.side===side && selectedPlayer.playerId===pid;
            const serving = match.server===side && team.serverPosition === (idx + 1);
            const pendingForTeam = pendingAttribution?.team === side;
            return (
              <button key={pid || idx} onClick={() => {
                  if (!pid) return;
                  if (pendingAttribution && pendingAttribution.team === side) { void attributePendingToPlayer(side, pid); return; }
                  const nextSel = sel ? null : { side, playerId: pid }; setSelectedPlayer(nextSel); if (nextSel) clearSelectionLater(12000);
                }}
                className={cn('min-h-[60px] rounded-lg border px-1.5 py-1 text-left transition touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-focus', sel ? 'border-accent bg-accent/15 ring-1 ring-accent/40' : pendingForTeam ? 'border-warning/50 bg-warning-subtle/40' : 'border-border bg-surface-sunken hover:bg-surface-alt')}>
                <div className="flex items-center justify-between text-[10px] text-fg-muted leading-none mb-0.5">
                  <span>P{idx+1}{serving && <span className="ml-1 text-success font-bold">• SERVE</span>}</span>
                  <span className="flex gap-0.5">{p?.isCaptain && <span className="px-1 rounded border border-warning/40 bg-warning-subtle text-warning font-bold">C</span>}{p?.isLibero && <span className="px-1 rounded border border-info/40 bg-info-subtle text-info font-bold">L</span>}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Avatar src={p?.thumbUrl || p?.photoUrl} name={p?.name} size={28} color={side==='A' ? 'var(--team-a)' : 'var(--team-b)'} textColor={side==='A' ? 'var(--team-a-text)' : 'var(--team-b-text)'} className="rounded-md" />
                  <div className="min-w-0">
                    <div className="font-bold text-[13px] text-fg truncate leading-tight"><span className="text-fg-muted mr-1">#{p?.jerseyNumber ?? '-'}</span>{shortName(p?.name)}</div>
                    <div className="text-[10px] text-fg-subtle truncate">{p?.position || ''}</div>
                  </div>
                </div>
              </button>
            );
          })}
          {lineup.length===0 && <div className="col-span-3 text-xs text-fg-subtle p-3 border border-dashed border-border rounded-lg">No on-court lineup data</div>}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-fg-muted">
          <Button size="sm" variant="outline" onClick={()=>{ setSubForm({ side, outId: lineup[0]?.id ? String(lineup[0].id) : '', inId: bench[0]?.id ? String(bench[0].id) : '' }); setSubOpen(true); }} disabled={!canPlay}><ArrowLeftRight className="w-3.5 h-3.5" />Sub/Libero</Button>
          <span>Subs {subsUsed}/{subsPerSet}</span>
          <span className="ml-auto flex items-center gap-0.5">{Array.from({length:pipsTotal}).map((_,i)=><span key={i} className={cn('inline-block w-2.5 h-2.5 rounded-full', i < pipsLeft ? (side==='A'?'bg-teamA':'bg-teamB') : 'bg-border')} />)}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {ACTIONS.map(a => {
            const scoring = ['KILL','ACE','BLOCK'].includes(a);
            return (
              <button key={a} onClick={()=>onAction(side,a)} disabled={!canPlay}
                className={cn('min-h-[34px] rounded-lg border text-[10px] font-bold px-0.5 transition touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:bg-surface-sunken disabled:text-fg-muted disabled:border-border disabled:opacity-100', scoring ? 'border-success/40 bg-success/15 text-success hover:bg-success/20' : 'border-border bg-surface-sunken text-fg hover:bg-surface-alt')}>
                {a.replace('ATTACK ERROR','ATK ERR').replace('SERVICE ERROR','SRV ERR').replace('RECEPTION ERROR','REC ERR')}
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-fg-subtle truncate">Bench: {bench.length ? bench.map((p:any)=>`#${p?.jerseyNumber ?? '-'}`).join(', ') : '-'}</div>
      </section>
    );
  };

  const renderBreakPanel = () => {
    const nextSet = match.current_set;
    const toCourtPlayers = (side: TeamKey): CourtPlayer[] => {
      const team = side === 'A' ? A : B;
      return [...(team.lineup || []), ...(team.bench || [])].map((p: any) => ({
        id: String(p.id || ''),
        name: p.name || `#${p.jerseyNumber ?? '?'}`,
        jerseyNumber: p.jerseyNumber ?? null,
        photoUrl: p.photoUrl || null,
        thumbUrl: p.thumbUrl || p.photoUrl || null,
        isLibero: !!p.isLibero,
        position: p.position || null,
      })).filter(p => p.id);
    };
    const renderPicker = (side: TeamKey) => {
      const team = side === 'A' ? A : B;
      const base = (team.lineup || []).slice(0, 6).map((p: any) => String(p.id || ''));
      const ids = nextLineups[side].length === 6 ? nextLineups[side] : base;
      const roster = toCourtPlayers(side);
      const rosterIds = new Set(roster.map(p => p.id));
      const copySaved = () => {
        const teamId = team?.id;
        if (!teamId) return notify.error('Team not available');
        try {
          const raw = localStorage.getItem(`qwesie:last-lineup:${teamId}`);
          if (!raw) return notify.error('No saved lineup found for this team');
          const parsed = JSON.parse(raw) as any;
          const arr = [1,2,3,4,5,6].map(i => {
            const id = parsed?.[i] || parsed?.[String(i)] || null;
            return id && rosterIds.has(String(id)) ? String(id) : '';
          });
          setNextLineups(nl => ({ ...nl, [side]: arr }));
          notify.success(`${team.shortName || side} saved lineup loaded`);
        } catch { notify.error('Failed to load saved lineup'); }
      };
      const resetPrev = () => setNextLineups(nl => ({ ...nl, [side]: base.map(v => v || '') }));
      return (
        <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={resetPrev}>Previous set</Button>
            <Button variant="outline" size="sm" onClick={copySaved}>Copy saved lineup</Button>
          </div>
          <CourtDiagram
            title={`${team.shortName || team.name} - starting six (Set ${nextSet})`}
            value={assignmentsFromArray(ids)}
            roster={roster}
            onChange={(next: LineupAssignments) => setNextLineups(nl => ({ ...nl, [side]: assignmentsToArray(next).map(v => v || '') }))}
            teamColor={team.primaryColor}
            teamTextColor={team.textColor}
          />
        </div>
      );
    };
    const setSummary = (match.setHistory||[]).filter((s:any)=>s.winner!=null || s.scoreA>0 || s.scoreB>0).map((s:any)=>`S${s.number} ${s.scoreA}-${s.scoreB}`).join(' · ') || '-';
    return (
      <div className="flex-1 min-h-0 overflow-auto p-3">
        <div className="max-w-7xl mx-auto grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-border bg-surface-raised p-4 flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-fg-muted">Break / Set interval</div>
              <div className="text-4xl font-black tabular-nums text-fg"><CountdownText endsAt={scene?.timerEndsAt} /></div>
              <div className="text-2xl font-black"><span className="text-info">{A.sets}</span><span className="text-fg-subtle"> - </span><span className="text-teamB">{B.sets}</span></div>
              <div className="text-sm text-fg-muted">Set summary: {setSummary}</div>
              <div className="rounded-lg border border-warning/30 bg-warning-subtle p-2 text-warning text-sm mt-2">Next: <b>Set {match.current_set}</b>. Confirm lineups then start.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={onStartSet}><Play className="w-4 h-4" />Start set {match.current_set}</Button>
              <Button variant="secondary" onClick={onResumeMatch}><Play className="w-4 h-4" />Resume match</Button>
              <Button variant="outline" onClick={()=>setBreakView(false)}>Back to scoring</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{renderPicker('A')}{renderPicker('B')}</div>
        </div>
      </div>
    );
  };

  const renderSubsModal = () => {
    const side = subForm.side;
    const team = match.teams[side];
    const onCourt = team.lineup || [];
    const bench = team.bench || [];
    const canConfirm = !!subForm.outId && !!subForm.inId && subForm.outId !== subForm.inId && canPlay;
    return (
      <Modal isOpen={subOpen} onClose={()=>setSubOpen(false)} title="Substitution / Libero swap">
        <div className="space-y-3">
          <div className="flex gap-2">{(['A','B'] as const).map(s => <Button key={s} size="sm" variant={subForm.side===s?'primary':'outline'} onClick={()=>setSubForm({ side:s, outId: match.teams[s].lineup?.[0]?.id ? String(match.teams[s].lineup[0].id) : '', inId: match.teams[s].bench?.[0]?.id ? String(match.teams[s].bench[0].id) : '' })}>{match.teams[s].shortName || s}</Button>)}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><div className="text-xs font-semibold text-fg-muted mb-1">OUT (on court)</div><div className="space-y-1 max-h-48 overflow-auto pr-1">{onCourt.map((p:any)=>(<button key={String(p.id)} onClick={()=>setSubForm(f=>({...f,outId:String(p.id)}))} className={cn('w-full text-left px-3 py-2 rounded-lg border text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-focus', subForm.outId===String(p.id)?'border-accent bg-accent text-accent-fg':'border-border-strong bg-surface-sunken text-fg hover:bg-surface-alt')}><b>#{p.jerseyNumber ?? '-'}</b> {p.name || 'Player'}</button>))}</div></div>
            <div><div className="text-xs font-semibold text-fg-muted mb-1">IN (bench)</div><div className="space-y-1 max-h-48 overflow-auto pr-1">{bench.map((p:any)=>(<button key={String(p.id)} onClick={()=>setSubForm(f=>({...f,inId:String(p.id)}))} className={cn('w-full text-left px-3 py-2 rounded-lg border text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-focus', subForm.inId===String(p.id)?'border-success bg-success/10 text-success':'border-border bg-surface-sunken text-fg hover:bg-surface-alt')}><b>#{p.jerseyNumber ?? '-'}</b> {p.name || 'Player'}</button>))}</div></div>
          </div>
          <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={()=>setSubOpen(false)}>Cancel</Button><Button variant="primary" disabled={!canConfirm} onClick={async ()=>{ try { await send({ kind:'sub', key:'sub', team: side, outId: subForm.outId, inId: subForm.inId, clientEventId: uuid() }); notify.success('Substitution recorded'); setSubOpen(false); } catch {} }}>Confirm</Button></div>
        </div>
      </Modal>
    );
  };

  const renderFlowBar = () => {
    const maxSets = match.max_sets || 5;
    const hist = match.setHistory || [];
    const steps: Array<{ key: string; label: string; sub?: string; active: boolean; done: boolean }> = [];
    const preDone = !['SCHEDULED','READY'].includes(match.status);
    const preActive = ['SCHEDULED','READY'].includes(match.status);
    steps.push({ key: 'pre', label: 'Pre-match', active: preActive, done: preDone });
    for (let n = 1; n <= maxSets; n++) {
      const h = hist.find((s: any) => s.number === n);
      const done = !!h?.winner;
      const active = !done && match.current_set === n && match.status !== 'COMPLETED' && match.status !== 'CANCELLED' && match.status !== 'BETWEEN_SETS';
      const sub = done ? `${h.scoreA}-${h.scoreB}` : undefined;
      steps.push({ key: `s${n}`, label: `Set ${n}`, sub, active, done });
      if (n < maxSets) {
        const breakActive = match.status === 'BETWEEN_SETS' && match.current_set === n + 1;
        const breakDone = done && (match.current_set > n || match.status === 'COMPLETED');
        steps.push({ key: `b${n}`, label: 'Break', active: breakActive, done: breakDone });
      }
    }
    const finalDone = match.status === 'COMPLETED';
    const finalActive = match.status === 'COMPLETED';
    steps.push({ key: 'final', label: 'Final', sub: finalDone ? `${A.sets}-${B.sets}` : undefined, active: finalActive, done: finalDone });
    return (
      <div className="px-2 pt-2 pb-1 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max text-[11px]">
          <div className="flex items-center gap-1 mr-2">
            <Button size="sm" variant="outline" onClick={()=>onCorrection('A', -1)} disabled={!canMinus('A')} className="px-1.5 py-0.5 text-xs">-1</Button>
            <span className="font-bold text-teamA">{A.score}</span>
            <Button size="sm" variant="outline" onClick={()=>onPoint('A')} disabled={!canPlay} className="px-1.5 py-0.5 text-xs">+1</Button>
            <span className="text-fg-subtle mx-1">-</span>
            <Button size="sm" variant="outline" onClick={()=>onCorrection('B', -1)} disabled={!canMinus('B')} className="px-1.5 py-0.5 text-xs">-1</Button>
            <span className="font-bold text-teamB">{B.score}</span>
            <Button size="sm" variant="outline" onClick={()=>onPoint('B')} disabled={!canPlay} className="px-1.5 py-0.5 text-xs">+1</Button>
          </div>
          {steps.map((st, i) => (
            <React.Fragment key={st.key}>
              {i > 0 && <span className="text-fg-subtle">›</span>}
              <span className={cn('px-2 py-1 rounded-md border whitespace-nowrap', st.active ? 'bg-accent text-accent-fg border-accent font-bold' : st.done ? 'bg-surface-alt text-fg border-border' : 'bg-surface-sunken text-fg-muted border-border')}>
                {st.label}{st.sub ? <span className={cn('ml-1', st.active ? 'text-accent-fg/80' : 'text-fg-muted')}>{st.sub}</span> : null}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  const renderScoreTab = () => (
    <div className="flex-1 min-h-0 flex flex-col">
      {renderFlowBar()}
      {coachStep > 0 && coachStep <= 3 && (
        <div className="mx-2 mt-1 rounded-lg border border-accent/40 bg-accent/10 p-2 text-xs text-fg flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-accent">Coach tip {coachStep}/3</div>
            <div>{coachStep === 1 ? 'Use the Flow bar to see where you are: Pre-match, sets, breaks, Final.' : coachStep === 2 ? 'Use the primary action button under the score for the next step: Start Set, End Set, or Start next set.' : 'After ending a set, use the Set Summary panel to show stats/result and start the next set.'}</div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="outline" onClick={() => { const next = coachStep >= 3 ? 0 : coachStep + 1; setCoachStep(next); if (next === 0) try { localStorage.setItem('qwesie.coach.live.v1','done'); } catch {} }}>{coachStep >= 3 ? 'Done' : 'Next'}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setCoachStep(0); try { localStorage.setItem('qwesie.coach.live.v1','done'); } catch {} }}>Skip</Button>
          </div>
        </div>
      )}
      {!breakView ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1fr_minmax(230px,280px)_1fr] gap-1.5 p-1.5 overflow-auto">
          {renderTeamHalf('A')}
          <div className="min-h-0 flex flex-col gap-1.5 rounded-xl border border-border bg-surface-sunken p-2">
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 text-center">
              <div className="text-[11px] tracking-widest text-fg-muted">SET {match.current_set} · SETS {A.sets}-{B.sets}</div>
              <div className="flex items-center justify-center gap-2">
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline" onClick={()=>onPoint('A')} disabled={!canPlay} className="px-2 py-1">+1</Button>
                  <Button size="sm" variant="outline" onClick={()=>onCorrection('A', -1)} disabled={!canMinus('A')} className="px-2 py-1">-1</Button>
                </div>
                <div className="text-5xl md:text-6xl font-black tabular-nums leading-none"><span className="text-info">{A.score}</span><span className="text-fg-subtle"> - </span><span className="text-teamB">{B.score}</span></div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline" onClick={()=>onPoint('B')} disabled={!canPlay} className="px-2 py-1">+1</Button>
                  <Button size="sm" variant="outline" onClick={()=>onCorrection('B', -1)} disabled={!canMinus('B')} className="px-2 py-1">-1</Button>
                </div>
              </div>
              {pendingAttribution && (
                <div className="text-[11px] text-warning bg-warning-subtle border border-warning/30 rounded-full px-2.5 py-1 max-w-full">
                  Attribute {pendingAttribution.action} ({pendingAttribution.team}) - tap player ({Math.max(0, Math.ceil((pendingAttribution.expiresAt - Date.now())/1000))}s)
                  {pendingAttribution.suggestedPlayerId && (() => { const p: any = (match.teams[pendingAttribution.team].lineup||[]).find((x:any)=>String(x.id)===String(pendingAttribution.suggestedPlayerId)); return p ? <button type="button" className="ml-2 underline font-semibold" onClick={() => void attributePendingToPlayer(pendingAttribution.team, String(p.id))}>Suggest #{p.jerseyNumber ?? '?'} {p.name || ''}</button> : null; })()}
                  {pendingAttribution.action === 'BLOCK' && <span className="ml-2 text-fg-muted">Choose blocker</span>}
                  <button type="button" className="ml-2 underline" onClick={clearAttributionWindow}>Skip</button>
                </div>
              )}
              {selectedPlayer && !pendingAttribution && <div className="text-[11px] text-warning bg-warning-subtle border border-warning/30 rounded-full px-2.5 py-0.5 max-w-full truncate">Selected: #{(match.teams[selectedPlayer.side].lineup||[]).find((p:any)=>String(p.id)===selectedPlayer.playerId)?.jerseyNumber ?? '?'} {(match.teams[selectedPlayer.side].lineup||[]).find((p:any)=>String(p.id)===selectedPlayer.playerId)?.name || ''}</div>}
              <div className="flex gap-2 flex-wrap justify-center">
                {(() => {
                  const s = match.status;
                  if (s === 'COMPLETED' || s === 'CANCELLED') return <Button variant="primary" size="sm" onClick={() => setSetSummarySet(setSummarySet || currentSetNumber)} className="px-4 py-2">View final</Button>;
                  if (s === 'BETWEEN_SETS') return <Button variant="primary" size="sm" onClick={openStartSetDialog} className="px-4 py-2"><ChevronRight className="w-4 h-4"/>Start Set {currentSetNumber}</Button>;
                  if (s === 'SCHEDULED' || s === 'READY') return <Button variant="primary" size="sm" onClick={openStartSetDialog} className="px-4 py-2"><ChevronRight className="w-4 h-4"/>Start Set 1</Button>;
                  if (s === 'LIVE' && (setCanEnd || pendingEndFlag)) {
                    const w = setWinnerSide || (curA > curB ? 'A' : curB > curA ? 'B' : null);
                    const label = w ? `End Set ${currentSetNumber} (${match.teams[w].shortName || w} wins ${curA}-${curB})` : `End Set ${currentSetNumber}`;
                    return <Button variant="primary" size="sm" onClick={() => void onEndSet()} className={cn('px-4 py-2', 'animate-pulse ring-2 ring-accent/50')}><ChevronRight className="w-4 h-4"/>{label}</Button>;
                  }
                  if (s === 'LIVE') return <Button variant="outline" size="sm" disabled title={`Set ends at ${targetPoints} with a ${minDiff}-point lead`} className="px-4 py-2 opacity-70">End Set {currentSetNumber}</Button>;
                  return null;
                })()}
              </div>
              {match.status === 'LIVE' && !setCanEnd && !pendingEndFlag && <div className="text-[11px] text-fg-muted">Set ends at {targetPoints} with a {minDiff}-point lead</div>}
              {pendingEndFlag && <div className="text-[11px] text-warning font-semibold">Set won - scoring locked. End set or undo.</div>}
              {(match.status === 'SCHEDULED' || match.status === 'READY') && <div className="text-[11px] text-fg-muted">Scoring starts after Start Set.</div>}
              {match.status === 'LIVE' && !pendingEndFlag && <button type="button" onClick={() => { setEndSetEarlyReason(''); setEndSetEarlyOpen(true); }} className="text-[11px] text-fg-subtle underline underline-offset-2 hover:text-fg">End set early…</button>}
              <Button variant="danger" onClick={()=>onUndo()} title={lastUndoLabel} className="w-full max-w-[260px] text-sm py-2.5"><RotateCcw className="w-4 h-4"/>{lastUndoLabel || 'UNDO (Z)'}</Button>
              <div className="w-full mt-0.5 min-h-0"><div className="text-[11px] text-fg-muted mb-1">Last 5 events (tap to attribute/undo)</div><div className="grid gap-1">{lastEvents.map((ev:any, i:number) => {
                const actionName = ev.action === 'ACTION_RECORDED' ? String(ev.payload?.action||'ACTION') : ev.action;
                const scoring = ev.action === 'POINT_AWARDED' || (ev.action === 'ACTION_RECORDED' && ['KILL','ACE','BLOCK','ATTACK_ERROR','POINT'].includes(String(ev.payload?.action||'').toUpperCase()));
                const unattributed = scoring && !ev.playerId && !ev.payload?.playerId;
                const attrPid = ev.playerId || ev.payload?.playerId;
                const canAir = !!attrPid && !!ev.team && scoring && String(ev.payload?.action || actionName).toUpperCase() !== 'ATTACK_ERROR';
                const oneClick = ((scene?.autoTriggers as any)?.attributionOnAir === 'one-click');
                return (
                  <div key={ev.id || ev.seq || i} className="flex items-center gap-1">
                    <button onClick={()=> { if (unattributed && ev.team) { startAttributionWindow(ev.clientEventId || String(ev.id), ev.team, actionName, ev.id); } else { onUndo(ev.clientEventId || ev.id); } }} className="flex-1 text-left px-2 py-1.5 rounded-lg border border-border bg-background/50 hover:bg-surface-alt text-[11px] leading-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"><b className={ev.team==='A'?'text-teamA':ev.team==='B'?'text-teamB':'text-fg-muted'}>{ev.team || 'SYS'}</b> {actionName} {unattributed ? <span className="text-warning">(tap player)</span> : attrPid ? <span className="text-success">• attributed</span> : null} <span className="text-fg-subtle">{ev.time || ''}</span></button>
                    {canAir && oneClick && <Button size="sm" variant="outline" onClick={()=>void pushAttributionOnAir(ev.team as TeamKey, String(attrPid), String(ev.payload?.action || actionName), true)} title="Show on air">Air</Button>}
                    <Button size="sm" variant="ghost" onClick={()=>onUndo(ev.clientEventId || ev.id)} title="Undo"><RotateCcw className="w-3 h-3"/></Button>
                  </div>
                );
              })}{!lastEvents.length && <div className="text-[11px] text-fg-subtle">No events</div>}</div></div>
            </div>
          </div>
          {renderTeamHalf('B')}
        </div>
      ) : renderBreakPanel()}
    </div>
  );

  const preloadIntroImages = async (urls: string[]) => {
    const unique = Array.from(new Set((urls || []).filter(u => /^(https?:\/\/|\/)/.test(String(u)))));
    setIntroReady({ ready: false, total: unique.length, loaded: 0 });
    let loaded = 0;
    await Promise.all(unique.map(src => new Promise<void>((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { loaded += 1; setIntroReady({ ready: loaded >= unique.length, total: unique.length, loaded }); resolve(); };
      img.onerror = () => { loaded += 1; setIntroReady({ ready: loaded >= unique.length, total: unique.length, loaded }); resolve(); };
      img.src = src;
    })));
    setIntroReady({ ready: true, total: unique.length, loaded: unique.length });
  };

  const introCountdown = (() => {
    if (!introSeq?.endsAt) return null;
    const ms = Math.max(0, new Date(introSeq.endsAt).getTime() - Date.now());
    return `${Math.ceil(ms / 1000)}s`;
  })();

  const renderGraphicsTab = () => {
    const onAirGraphicName = scene?.template ? String(scene.template).replace(/_/g, ' ') : (scene?.scene && scene.scene !== 'PLAY' ? String(scene.scene).replace(/_/g, ' ') : 'Scorebug');
    const previewPending = graphicsMode === 'preview_take' && !!previewState.cue && (
      (previewState.cue.template || null) !== (scene?.template || null)
    );
    const ackChips = (() => {
      const relevant = (outputAcks || []).filter((a: any) => a && (a.clientType === 'scorebug' || a.clientType === 'graphics' || a.clientType === 'all'));
      if (relevant.length === 0) return [{ kind: 'none' as const, text: 'No output connected' }];
      return relevant.map((a: any) => {
        const t = a.template ? String(a.template).replace(/_/g, ' ') : 'SCOREBUG';
        const followingOther = a.matchId && a.matchId !== matchId;
        const followLabel = followingOther ? (a.matchId === onAirMatchId && onAirMatch ? `#${onAirMatch.matchNumber || '?'}` : `#${String(a.matchId).slice(-6)}`) : '';
        return {
          kind: followingOther ? 'mismatch' as const : 'ok' as const,
          text: `Court ${court} / ${a.clientType}: showing ${t} v${a.version || 0}`,
          mismatchText: followingOther ? `output is following ${followLabel}, not this match` : '',
          fixMatchId: a.matchId,
        };
      });
    })();
    return (
    <div className="flex-1 min-h-0 overflow-auto p-3 space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1.2fr] gap-3 items-start">
        <MonitorView match={match} scene={previewScene} label="Preview" />
        <MonitorView match={match} scene={scene} label="Program" onAir={programOnAir} />
        <div className="space-y-3 min-w-0">
          <Card className="!p-3">
            <CardHeader><CardTitle>Cue control</CardTitle><Layers className="w-4 h-4 text-fg-muted" /></CardHeader>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Label className="!mb-0 text-[11px]">Mode</Label>
              <div className="inline-flex rounded-lg border border-border overflow-hidden">
                <button type="button" className={cn('px-2.5 py-1 text-xs font-semibold', graphicsMode==='direct' ? 'bg-accent text-accent-fg' : 'bg-surface-sunken text-fg-muted hover:bg-surface-alt')} onClick={()=>{ setGraphicsMode('direct'); try { localStorage.setItem('qwesie.graphicsMode','direct'); } catch {} }}>Direct</button>
                <button type="button" className={cn('px-2.5 py-1 text-xs font-semibold border-l border-border', graphicsMode==='preview_take' ? 'bg-accent text-accent-fg' : 'bg-surface-sunken text-fg-muted hover:bg-surface-alt')} onClick={()=>{ setGraphicsMode('preview_take'); try { localStorage.setItem('qwesie.graphicsMode','preview_take'); } catch {} }}>Preview then Take</button>
              </div>
              {programOnAir && <span className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wider text-danger px-2 py-0.5 rounded border border-danger/40 bg-danger-subtle"><span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />ON AIR: {onAirGraphicName}</span>}
            </div>
            {graphicsMode === 'preview_take' && previewPending && (
              <div className="mb-2 rounded-lg border border-warning/40 bg-warning-subtle text-warning px-3 py-2 text-xs font-semibold">
                Loaded in Preview. Press TAKE (Enter) to send to OBS.
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Button size="sm" variant="primary" className={cn(previewPending && 'animate-pulse ring-2 ring-warning/60')} onClick={()=>void takePreview()} disabled={cueBusy !== null}><ArrowRightCircle className="w-4 h-4" />TAKE (Enter)</Button>
              <Button size="sm" variant="danger" onClick={()=>void clearProgram()} disabled={cueBusy !== null}><XCircle className="w-4 h-4" />CLEAR (Esc)</Button>
              <div className={cn('text-[11px] px-2 py-1 rounded border font-semibold', programOnAir ? 'border-danger/40 text-danger bg-danger-subtle' : 'border-border text-fg-muted bg-surface-sunken')}>{programOnAir ? `ON AIR: ${onAirGraphicName}` : 'ON AIR: Scorebug / Clear'}</div>
            </div>
            <div className="text-[11px] text-fg-muted mb-2">Preview: <span className="text-fg font-semibold">{cueLabel(previewState.cue)}</span></div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Label className="!mb-0 text-[11px]">Player attribution on air</Label>
              <select
                className="h-8 rounded-[8px] border border-border-strong bg-surface-sunken px-2 text-xs text-fg"
                value={(scene?.autoTriggers as any)?.attributionOnAir || 'off'}
                onChange={async (e) => {
                  if (!matchId) return;
                  const value = e.target.value as 'off' | 'auto' | 'one-click';
                  try { await broadcastApi.setAutoTriggers(matchId, { attributionOnAir: value }); await refetchScene(); }
                  catch (err: any) { notify.error(err?.message || 'Failed to update attribution setting'); }
                }}
                disabled={!matchId}
              >
                <option value="off">Off</option>
                <option value="auto">Auto</option>
                <option value="one-click">One-click</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {SCENE_BTNS.map(b => (
                <Button key={b.scene} size="sm" variant={(previewState.cue?.template || null) === (b.cue.template || null) ? 'primary' : 'outline'} onClick={()=>void loadPreview(b.cue)} title={`Load ${b.label} to preview${b.key ? ` (${b.key})` : ''}`}>
                  <Eye className="w-3.5 h-3.5" />{b.label}{b.key?` (${b.key})`:''}
                </Button>
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-fg-muted">Output status</div>
              <div className="flex flex-wrap gap-1.5">
                {ackChips.map((c: any, i: number) => c.kind === 'none' ? (
                  <span key={i} className="text-[11px] px-2 py-1 rounded border border-warning/40 bg-warning-subtle text-warning">{c.text}</span>
                ) : c.kind === 'mismatch' ? (
                  <span key={i} className="text-[11px] px-2 py-1 rounded border border-warning/40 bg-warning-subtle text-warning inline-flex items-center gap-1.5">
                    <span>{c.text} — {c.mismatchText}</span>
                    <button type="button" className="underline font-bold" onClick={() => { const mId = c.fixMatchId; if (mId) { void systemApi.setActiveCourtMatch(court, mId).then(()=>systemApi.activeCourtMatch(court)).then(r=>setCourtOnAirState(r)).catch(()=>{}); navigate(`/live/${mId}?tab=graphics`); } }}>Fix</button>
                  </span>
                ) : (
                  <span key={i} className="text-[11px] px-2 py-1 rounded border border-success/40 bg-success-subtle text-success">{c.text}</span>
                ))}
              </div>
            </div>
          </Card>

          <Card className="!p-3">
            <CardHeader><CardTitle>Cue library & graphics</CardTitle><Tv className="w-4 h-4 text-fg-muted" /></CardHeader>
            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="md:col-span-2"><Label>Template</Label><Select value={selectedTemplate} onChange={e=>setSelectedTemplate(e.target.value)}>{(templates as any[]).map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>
                <div><Label>Duration (s, 0=manual)</Label><Input type="number" min={0} value={graphicDuration} onChange={e=>setGraphicDuration(e.target.value)} /></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={()=>activateTemplate(selectedTemplate)} disabled={!matchId}>Activate / Replace</Button>
                <Button size="sm" variant="danger" onClick={dismissGraphic} disabled={!matchId}>Dismiss graphic</Button>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs text-fg-muted">Theme</label>
                  <select
                    className="h-8 rounded-[8px] border border-border-strong bg-surface-sunken px-2 text-xs text-fg"
                    value={scene?.scorebug?.themeId || scene?.scorebugTheme?.id || 'builtin-classic'}
                    onChange={async (e) => {
                      if (!matchId) return;
                      const themeId = e.target.value || null;
                      setThemeApplying(true);
                      try { await scorebugThemeApi.applyToMatch(matchId, themeId); } catch (err: any) { notify.error(err?.message || 'Failed to apply theme'); }
                      finally { setThemeApplying(false); }
                    }}
                    disabled={!matchId || themeApplying}
                  >
                    {scorebugThemes.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</option>)}
                  </select>
                  <Link to={`/design/scorebug${matchId ? `?matchId=${encodeURIComponent(matchId)}` : ''}`} className="text-xs font-semibold text-accent hover:underline">Open designer</Link>
                </div>
                <Button size="sm" variant="outline" onClick={onToggleLock}>Lock {scene?.lock?'ON':'OFF'}</Button>
              </div>
              <div className="text-xs text-fg-subtle">Active: <span className="font-semibold text-fg-muted">{(graphicState?.activeTemplate || 'SCOREBUG').replace(/_/g,' ')}</span> {graphicState?.visible ? '(visible)' : ''}</div>
            </div>
          </Card>

          <Card className="!p-3 border-warning/30 bg-warning-subtle">
            <CardHeader><CardTitle>Break controls</CardTitle><Coffee className="w-4 h-4 text-warning" /></CardHeader>
            <div className="space-y-2">
              <div className={cn('text-xs px-2.5 py-1 rounded-full border font-semibold inline-flex', breakActive ? 'bg-warning-subtle border-warning/30 text-warning' : 'bg-surface-raised border-border text-fg-muted')}>{breakActive ? `ACTIVE: ${breakState?.label}` : 'No active break'}</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="md:col-span-2"><Label>Break type</Label><Select value={breakType} onChange={e=>{ const v=e.target.value; setBreakType(v); const def = BREAK_TYPES.find(b=>b.id===v)?.defaultDuration ?? 30; setBreakDuration(String(def)); }}>{BREAK_TYPES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</Select></div>
                <div><Label>Duration (s)</Label><Input type="number" min={0} value={breakDuration} onChange={e=>setBreakDuration(e.target.value)} /></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={startBreak} disabled={!matchId}><TimerReset className="w-4 h-4" />Start break</Button>
                <Button size="sm" variant="outline" onClick={endBreak} disabled={!matchId || !breakActive}>End break state</Button>
                <Button size="sm" variant="secondary" onClick={onResumeMatch} disabled={!matchId}><Play className="w-4 h-4" />Resume match</Button>
              </div>
              {breakActive && suggested.length > 0 && (
                <div className="pt-1">
                  <div className="text-xs font-semibold text-warning mb-1">Suggested graphics</div>
                  <div className="flex flex-wrap gap-1.5">{suggested.map(id => { const t = (templates as any[]).find(x=>x.id===id); return <Button key={id} size="sm" variant="outline" onClick={()=>{ setSelectedTemplate(id); void activateTemplate(id); }}>{t?.name || id.replace(/_/g,' ')}</Button>; })}</div>
                </div>
              )}
            </div>
          </Card>

          <Card className="!p-3">
            <CardHeader><CardTitle>Intro Sequence</CardTitle><Play className="w-4 h-4 text-fg-muted" /></CardHeader>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={cn('px-2 py-1 rounded border font-semibold', introSeq?.status === 'running' ? 'border-success/40 bg-success-subtle text-success' : introSeq?.status === 'paused' ? 'border-warning/40 bg-warning-subtle text-warning' : 'border-border bg-surface-sunken text-fg-muted')}>{String(introSeq?.status || 'idle').toUpperCase()}</span>
                <span className="text-fg-muted">Step {(introSeq?.index ?? 0) + 1}/{Math.max(1, (introSeq?.steps || []).filter((s:any)=>s.enabled!==false).length)}</span>
                {introSeq?.status === 'running' && <span className="text-warning font-semibold">Next in {introCountdown || '-'}</span>}
                <span className="text-fg-muted">Mode: {graphicsMode === 'preview_take' ? 'Preview-then-Take' : 'Direct'}</span>
              </div>
              <div className="text-[11px] text-fg-muted">Images: {introReady.loaded}/{introReady.total} ready {introReady.ready ? '• OK' : ''}</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={async ()=>{ if(!matchId) return; const seq = introSeq?.steps?.length ? introSeq : await broadcastApi.getIntroSequence(matchId); await preloadIntroImages(seq?.preload || []); await broadcastApi.startIntroSequence(matchId, { regenerate: !introSeq?.steps?.length, mode: graphicsMode }); await refetchIntroSeq(); }}>Start</Button>
                <Button size="sm" variant="outline" onClick={async ()=>{ if(!matchId) return; await broadcastApi.controlIntroSequence(matchId,{action:'prev'}); await refetchIntroSeq(); }}>Previous</Button>
                <Button size="sm" variant="outline" onClick={async ()=>{ if(!matchId) return; await broadcastApi.controlIntroSequence(matchId,{action:introSeq?.status==='paused'?'resume':'pause'}); await refetchIntroSeq(); }}>{introSeq?.status==='paused'?'Resume':'Pause'}</Button>
                <Button size="sm" variant="outline" onClick={async ()=>{ if(!matchId) return; await broadcastApi.controlIntroSequence(matchId,{action:'next'}); await refetchIntroSeq(); }}>Next/Skip</Button>
                <Button size="sm" variant="danger" onClick={async ()=>{ if(!matchId) return; await broadcastApi.controlIntroSequence(matchId,{action:'stop'}); await refetchIntroSeq(); }}>Stop</Button>
                <Button size="sm" variant="outline" onClick={async ()=>{ if(!matchId) return; await broadcastApi.startIntroSequence(matchId,{regenerate:true, mode:graphicsMode}); await refetchIntroSeq(); }}>Regenerate</Button>
              </div>
              <div className="max-h-52 overflow-auto border border-border rounded-lg divide-y divide-border bg-surface-sunken">
                {(introSeq?.steps || []).map((s: any, i: number) => (
                  <div key={s.id || i} className={cn('px-2 py-1.5 text-xs flex items-center gap-2', i === introSeq?.index ? 'bg-accent/10' : '')}>
                    <button type="button" className={cn('w-4 h-4 rounded border', s.enabled !== false ? 'bg-accent border-accent' : 'border-border-strong')} title="Enable/disable" onClick={async ()=>{ if(!matchId||!introSeq) return; const steps=[...introSeq.steps]; steps[i]={...steps[i], enabled: steps[i].enabled===false}; await broadcastApi.updateIntroSequence(matchId,{steps}); await refetchIntroSeq(); }} />
                    <span className="flex-1 truncate">{s.label || s.template}</span>
                    <input className="w-16 h-7 rounded border border-border bg-surface px-1 text-xs" type="number" min={1} max={120} value={Math.round((s.durationMs||8000)/1000)} onChange={async (e)=>{ if(!matchId||!introSeq) return; const steps=[...introSeq.steps]; steps[i]={...steps[i], durationMs: Math.max(1000, Number(e.target.value||8)*1000)}; await broadcastApi.updateIntroSequence(matchId,{steps}); await refetchIntroSeq(); }} />
                    <span className="text-fg-subtle">s</span>
                    <button type="button" className="text-fg-muted hover:text-fg" title="Move up" onClick={async ()=>{ if(!matchId||!introSeq||i===0) return; const steps=[...introSeq.steps]; const [it]=steps.splice(i,1); steps.splice(i-1,0,it); await broadcastApi.updateIntroSequence(matchId,{steps}); await refetchIntroSeq(); }}>↑</button>
                    <button type="button" className="text-fg-muted hover:text-fg" title="Move down" onClick={async ()=>{ if(!matchId||!introSeq||i>=introSeq.steps.length-1) return; const steps=[...introSeq.steps]; const [it]=steps.splice(i,1); steps.splice(i+1,0,it); await broadcastApi.updateIntroSequence(matchId,{steps}); await refetchIntroSeq(); }}>↓</button>
                  </div>
                ))}
                {!introSeq?.steps?.length && <div className="px-2 py-3 text-xs text-fg-subtle">No sequence generated. Click Start or Regenerate.</div>}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
    );
  };

  const renderOutputsTab = () => (
    <div className="flex-1 min-h-0 overflow-auto p-3">
      <OutputsPanel inline open={true} onClose={() => {}} matchId={matchId} court={match?.court} />
    </div>
  );

  return (
    <div className="h-[calc(100vh-8.5rem)] max-h-[calc(100vh-8.5rem)] overflow-hidden bg-background text-fg flex flex-col rounded-xl border border-border">
      {/* Status strip */}
      <div className="shrink-0 border-b border-border bg-surface px-2 py-1.5 grid grid-cols-2 lg:grid-cols-[1.2fr_auto_auto_auto_auto_auto] gap-1.5 items-center text-[11px] font-display tracking-wide">
        <div className="min-w-0 flex items-center gap-2 flex-wrap"><span className="font-bold text-fg truncate">#{match.match_no} · {match.tournament || 'Match'} · Set {match.current_set}/{match.max_sets}</span><Badge variant={match.status==='LIVE'?'live':match.status==='FINISHED'||match.status==='COMPLETED'?'finished':'neutral'}>{match.status}</Badge>{flagChip && <span className="px-2 py-0.5 rounded-full bg-warning-subtle text-warning font-bold">{flagChip}</span>}</div>
        <div className={cn('font-semibold flex items-center gap-1', conn==='CONNECTED'?'text-success':conn==='RECONNECTING'?'text-warning':'text-danger')}>{conn==='CONNECTED'?<Wifi className="w-3.5 h-3.5"/>:<WifiOff className="w-3.5 h-3.5"/>}{conn}{queue.length ? ` · queued ${queue.length}` : ''}</div>
        <div className="text-fg-muted flex items-center gap-1"><Clock3 className="w-3.5 h-3.5"/> <span className="tabular-nums font-semibold"><ElapsedClock startedAt={match.started_at} endedAt={match.ended_at} status={match.status} /></span></div>
        <div className="text-fg-muted">Serve: <b className={match.server==='A'?'text-teamA':'text-teamB'}>{match.teams[match.server]?.shortName || match.server}</b></div>
        <div className="flex items-center gap-2 flex-wrap"><span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border', onAir.sb?'border-success/40 text-success bg-success-subtle':'border-border text-fg-subtle')}><Radio className="w-3 h-3"/>SB {clients?.scorebug ?? '-'}</span><span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border', onAir.gfx?'border-success/40 text-success bg-success-subtle':'border-border text-fg-subtle')}><Monitor className="w-3 h-3"/>GFX {clients?.graphics ?? '-'}</span>{programOnAir && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-danger/40 text-danger bg-danger-subtle font-bold"><span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />PROGRAM</span>}</div>
        <div className="flex items-center gap-1.5 justify-end"><Button size="sm" variant="outline" onClick={()=>setHelpDrawerOpen(true)} title="How a match runs / shortcuts (?)">?</Button></div>
      </div>

      {(onAirLabel || consoleDiffersFromOnAir) && (
        <div className={cn('shrink-0 border-b px-3 py-2 text-xs flex flex-wrap items-center gap-2', consoleDiffersFromOnAir ? 'border-warning/40 bg-warning-subtle text-warning' : 'border-border bg-surface-alt text-fg-muted')}>
          <span className="font-semibold">On air for Court {court}:</span>
          <span className="text-fg">{onAirLabel || 'No on-air match assigned'}</span>
          {consoleDiffersFromOnAir && <span className="text-warning">Console is controlling a different match.</span>}
          {consoleDiffersFromOnAir && onAirMatchId && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/live/${onAirMatchId}`)}>Switch console to on-air match</Button>
          )}
          {consoleDiffersFromOnAir && (
            <Button size="sm" variant="secondary" onClick={async () => { try { await systemApi.setActiveCourtMatch(court, matchId); const r = await systemApi.activeCourtMatch(court); setCourtOnAirState(r); notify.success('This match is now on air for the court'); } catch (e: any) { notify.error(e?.message || 'Failed to set on-air match'); } }}>Make this match on-air</Button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="shrink-0 border-b border-border bg-surface px-2 flex items-center gap-1">
        {([
          { id: 'score' as const, label: 'Score', icon: Gauge },
          { id: 'graphics' as const, label: 'Graphics', icon: Layers },
          { id: 'outputs' as const, label: 'Outputs', icon: Tv },
        ]).map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn('inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus', active ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg')}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
        <div className="ml-auto text-[11px] text-fg-subtle pr-2 hidden md:block">1-7 Preview · Enter Take · Esc Clear · O Outputs</div>
      </div>

      {tab === 'score' && renderScoreTab()}
      {tab === 'graphics' && renderGraphicsTab()}
      {tab === 'outputs' && renderOutputsTab()}
      {renderSubsModal()}

      {/* Scorebug settings moved to /design/scorebug; Live Control keeps a small theme picker. */}

      {helpOpen && (<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setHelpOpen(false)}><div className="w-full max-w-2xl bg-surface-raised border border-border-strong rounded-xl p-5 text-fg" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between mb-3"><div className="text-xl font-bold font-display">Keyboard shortcuts</div><button onClick={()=>setHelpOpen(false)} className="p-1.5 rounded-[10px] text-fg-muted hover:text-fg hover:bg-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-focus" aria-label="Close"><X className="w-5 h-5" /></button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-fg"><div>Q / W - +1 Team A / B</div><div>Z - Undo last</div><div>A / K / B - Ace / Kill / Block (score tab)</div><div>1-6 - Select player P1-P6 (score tab)</div><div>E - End set</div><div>F1/F2 or !/@ - Timeout A/B</div><div>1-7 - Load graphic to Preview (graphics tab)</div><div>Enter - TAKE Preview to Program</div><div>Esc - CLEAR Program (restore scorebug)</div><div>O - Outputs tab</div><div>? - Help</div><div className="text-fg-muted">Shortcuts ignored while typing in inputs. -1 is a manual correction; use Undo if needed.</div></div><div className="mt-4 text-right"><Button variant="outline" onClick={()=>setHelpOpen(false)}>Close</Button></div></div></div>)}

      <Modal isOpen={!!confirm} onClose={()=>setConfirm(null)} title="Confirm"><div className="space-y-3"><div className="text-sm text-fg">{confirm?.label}</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setConfirm(null)}>Cancel</Button><Button variant="danger" onClick={async ()=>{ if (confirm?.type==='finish') { try { await send({ kind:'status', key:'status', status:'FINISHED', clientEventId: uuid() }); } catch {} } setConfirm(null); }}>Confirm</Button></div></div></Modal>

      <Modal isOpen={startSetOpen} onClose={() => setStartSetOpen(false)} title={match.status === 'BETWEEN_SETS' ? `Start Set ${match.current_set}` : `Start Set ${match.current_set || 1}`}>
        <div className="space-y-3">
          <div className="text-sm text-fg-muted">Pre-flight check before starting the set.</div>
          <div className="space-y-1 text-sm">
            <div className={cn('px-2 py-1 rounded border', (A.lineup?.length||0) >= 6 && (B.lineup?.length||0) >= 6 ? 'border-success/30 bg-success-subtle text-success' : 'border-warning/30 bg-warning-subtle text-warning')}>Rosters / starting six: {(A.lineup?.length||0) >= 6 && (B.lineup?.length||0) >= 6 ? 'Ready' : 'Check lineups'}</div>
            <div className={cn('px-2 py-1 rounded border', ((clients?.scorebug||0)+(clients?.graphics||0))>0 ? 'border-success/30 bg-success-subtle text-success' : 'border-warning/30 bg-warning-subtle text-warning')}>Outputs connected: {((clients?.scorebug||0)+(clients?.graphics||0))>0 ? `${(clients?.scorebug||0)+(clients?.graphics||0)} client(s)` : 'None detected'}</div>
            <div className="px-2 py-1 rounded border border-border bg-surface-sunken text-fg">Match: {A.shortName||A.name} vs {B.shortName||B.name} · Court {match.court || '-'}</div>
          </div>
          <div>
            <Label>First server</Label>
            <div className="flex gap-2">
              {(['A','B'] as const).map(side => (
                <Button key={side} size="sm" variant={startSetServing===side?'primary':'outline'} onClick={() => setStartSetServing(side)}>{match.teams[side].shortName || side}</Button>
              ))}
            </div>
          </div>
          <div className="text-xs text-fg-muted">Confirm starting six in the break/set panel if needed, then start.</div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStartSetOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void confirmStartSet()}>Start Set {match.status === 'BETWEEN_SETS' ? match.current_set : (match.current_set || 1)}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={setSummarySet != null} onClose={() => { setSetSummarySet(null); setBreakView(false); }} title={setSummarySet ? `Set ${setSummarySet} summary` : 'Set summary'}>
        {(() => {
          const sNum = setSummarySet || currentSetNumber;
          const hist = (match.setHistory || []).find((s: any) => s.number === sNum);
          const winner = hist?.winner ? match.teams[hist.winner as TeamKey] : null;
          const scoreText = hist ? `${hist.scoreA}-${hist.scoreB}` : `${curA}-${curB}`;
          return (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-surface-sunken p-3">
                <div className="text-xs text-fg-muted">Set score</div>
                <div className="text-2xl font-black text-fg">{scoreText}</div>
                <div className="text-sm text-fg-muted">{winner ? `${winner.shortName || winner.name} won set ${sNum}` : `Set ${sNum}`}</div>
              </div>
              {autoSeq.active && autoSeq.phase === 'result' && (
                <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm">
                  <div className="font-semibold text-fg">Auto-sequence: Set Result on air</div>
                  <div className="text-fg-muted">Break slate starts in <span className="font-bold text-fg tabular-nums">{autoSeq.hold ? 'HOLD' : `${autoSeq.secondsLeft}s`}</span></div>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={toggleAutoSequenceHold}>{autoSeq.hold ? 'Resume' : 'Hold'}</Button>
                    <Button size="sm" variant="primary" onClick={() => void skipAutoSequence()}>Skip to break</Button>
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-border bg-surface-sunken p-3 text-sm text-fg-muted">
                <div className="font-semibold text-fg mb-1">Key stats</div>
                {(() => {
                  const setStats = buildSetStatsPayload(sNum, setSummaryData);
                  const a = setStats.teams.A; const b = setStats.teams.B;
                  const statRow = (label: string, av: any, bv: any, fmt?: (v:any)=>string) => (
                    <div key={label} className="grid grid-cols-[1fr_auto_1fr] gap-2 py-0.5 border-b border-border/50 last:border-0">
                      <div className="text-right tabular-nums text-fg">{fmt ? fmt(av) : (av ?? '-')}</div>
                      <div className="text-fg-muted text-xs uppercase tracking-wide text-center min-w-[110px]">{label}</div>
                      <div className="tabular-nums text-fg">{fmt ? fmt(bv) : (bv ?? '-')}</div>
                    </div>
                  );
                  const fmtPct = (v: any) => v == null ? '-' : `${Number(v).toFixed(1)}%`;
                  const fmtEff = (v: any) => v == null ? '-' : Number(v).toFixed(3);
                  return (
                    <div>
                      <div className="text-[11px] text-fg-subtle mb-1">{match.teams.A.shortName || 'A'} vs {match.teams.B.shortName || 'B'}</div>
                      {statRow('Points', a?.points ?? hist?.scoreA ?? '-', b?.points ?? hist?.scoreB ?? '-')}
                      {statRow('Kills', a?.kills, b?.kills)}
                      {statRow('Aces', a?.aces, b?.aces)}
                      {statRow('Blocks', a?.blocks, b?.blocks)}
                      {statRow('Errors', a?.errors, b?.errors)}
                      {statRow('Atk efficiency', a?.attackEfficiency, b?.attackEfficiency, fmtEff)}
                      {statRow('Side-out %', a?.sideOutPct, b?.sideOutPct, fmtPct)}
                      {statRow('Timeouts used', a?.timeoutsUsed, b?.timeoutsUsed)}
                      {statRow('Subs used', a?.substitutionsUsed, b?.substitutionsUsed)}
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="font-semibold text-fg-muted mb-0.5">Top scorers {match.teams.A.shortName || 'A'}</div>
                          {(setStats.topScorers.A.length ? setStats.topScorers.A : [{name:'-'}]).map((p:any,i:number)=><div key={i} className="truncate">{p.jerseyNumber!=null?`#${p.jerseyNumber} `:''}{p.name}{p.points!=null?` · ${p.points} pts`:''}</div>)}
                        </div>
                        <div>
                          <div className="font-semibold text-fg-muted mb-0.5">Top scorers {match.teams.B.shortName || 'B'}</div>
                          {(setStats.topScorers.B.length ? setStats.topScorers.B : [{name:'-'}]).map((p:any,i:number)=><div key={i} className="truncate">{p.jerseyNumber!=null?`#${p.jerseyNumber} `:''}{p.name}{p.points!=null?` · ${p.points} pts`:''}</div>)}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => { const p = buildSetStatsPayload(sNum, setSummaryData); void loadPreview({ template: 'SET_ANALYSIS', payload: { setNumber: sNum, setStats: p }, autoReturn: false }); }}>Show set stats full screen</Button>
                <Button variant="outline" onClick={() => { const p = buildSetStatsPayload(sNum, setSummaryData); void loadPreview({ template: 'SET_RESULT', payload: { setNumber: sNum, setStats: p }, autoReturn: false }); }}>Show set result</Button>
                <Button variant="outline" onClick={() => { void cancelAutoSequence({ unlock: true }); void startBreak(); }}>Start break timer and slate</Button>
                {match.status !== 'COMPLETED' ? <Button variant="primary" onClick={() => { void cancelAutoSequence({ unlock: true }); setSetSummarySet(null); openStartSetDialog(); }}>Start Set {Math.min((sNum || 1) + 1, match.max_sets || 5)}</Button> : <Button variant="primary" onClick={() => void loadPreview({ template: 'FINAL_MATCH_RESULT', payload: {}, autoReturn: false })}>Show final result</Button>}
              </div>
              {match.status === 'COMPLETED' && <Button variant="danger" onClick={async () => { try { await send({ kind:'status', key:'status-complete', status:'COMPLETED', clientEventId: uuid() }); } catch {} }}>End match</Button>}
              <div className="flex justify-end"><Button variant="ghost" onClick={() => { setSetSummarySet(null); setBreakView(false); }}>Back to scoreboard</Button></div>
            </div>
          );
        })()}
      </Modal>

      <Modal isOpen={endSetEarlyOpen} onClose={() => setEndSetEarlyOpen(false)} title="End set early">
        <div className="space-y-3">
          <div className="text-sm text-fg-muted">Use only for referee decisions. This requires a reason.</div>
          <div><Label>Reason</Label><Input value={endSetEarlyReason} onChange={e => setEndSetEarlyReason(e.target.value)} placeholder="e.g. Referee decision: injury forfeit" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEndSetEarlyOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={!endSetEarlyReason.trim()} onClick={async () => { setEndSetEarlyOpen(false); await onEndSet({ force: true, reason: endSetEarlyReason.trim() }); }}>End set early</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={helpDrawerOpen} onClose={() => setHelpDrawerOpen(false)} title="How a match runs">
        <div className="space-y-3 text-sm text-fg">
          <ol className="list-decimal pl-5 space-y-1">
            <li>Prepare: teams, rosters, starting six, court, outputs.</li>
            <li>Pre-match graphics: Match Intro, Team Intro, Lineups.</li>
            <li>Press Start Set 1. Confirm checklist and first server.</li>
            <li>Score points. Scoring is locked until set starts and during pending end.</li>
            <li>At winning score, click End Set. Undo still works while pending.</li>
            <li>Use Set Summary: show stats/result, start break, start next set.</li>
            <li>Repeat. After deciding set, show final result and end match.</li>
          </ol>
          <div className="border-t border-border pt-2">
            <div className="font-semibold mb-1">Keyboard map</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-fg-muted">
              <div>Q/W: +1 Team A/B</div><div>Z: Undo last</div><div>A/K/B: Ace/Kill/Block (score tab)</div><div>1-6: Select player P1-P6 (score tab)</div><div>E: End set (when legal)</div><div>F1/F2 or !/@: Timeout A/B</div><div>1-7: Load graphic (graphics tab)</div><div>Enter: TAKE</div><div>Esc: CLEAR</div><div>O: Outputs</div><div>?: Help</div>
            </div>
          </div>
          <div className="border-t border-border pt-2 text-fg-muted">
            <div className="font-semibold mb-1 text-fg">Scoring corrections</div>
            <div>-1 is a manual correction: removes one point from the selected team in the current set. It never goes below 0 and is blocked once the set is complete or pending end (use Undo end of set instead). If the last scoring event overall belongs to that team, -1 acts as a true undo of it; otherwise it records a score correction without changing rotation. Every -1 is logged.</div>
          </div>
          <div className="flex justify-end"><Button variant="outline" onClick={() => setHelpDrawerOpen(false)}>Close</Button></div>
        </div>
      </Modal>

      <OutputsPanel open={outputsOpen} onClose={()=>setOutputsOpen(false)} matchId={matchId} court={match?.court} />
      <CourtConflictDialog
        open={!!conflict}
        court={conflict?.court || String(match?.court || '1')}
        conflict={conflict?.conflict || null}
        onClose={() => setConflict(null)}
        onResolved={async () => { const r = conflict?.retry; setConflict(null); if (r) await r(); }}
      />
    </div>
  );
};

export default LiveControlPage;

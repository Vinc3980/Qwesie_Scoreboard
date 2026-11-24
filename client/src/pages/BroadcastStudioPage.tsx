import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SOCKET_EVENTS } from '@qwesie/shared';
import { MonitorPlay, Copy, ExternalLink, SlidersHorizontal, Play, Square, RefreshCw, Tv2, Eye, TimerReset, Coffee, RotateCcw } from 'lucide-react';
import { broadcastApi, systemApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input, Label, Select } from '../components/ui/Input.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { useCurrentMatch } from '../contexts/CurrentMatchContext.js';
import { getSocket } from '../services/socket.js';
import { withOverlayBg } from '../utils/overlay.js';
import { copyToClipboard } from '../utils/clipboard.js';
import { buildCourtOutputUrl, resolveOutputBaseUrl } from '../utils/outputUrls.js';

const scorebugDefaults = {
  visible: true,
  position: 'top-left',
  scale: 1,
  variant: 'classic',
  showSetHistory: false,
  showPreMatch: true,
  showLogos: true,
  showTournament: true,
  tournamentLabel: '',
};

const BREAK_TYPES = [
  { id: 'TEAM_A_TIMEOUT', label: 'Team A Timeout', defaultDuration: 30 },
  { id: 'TEAM_B_TIMEOUT', label: 'Team B Timeout', defaultDuration: 30 },
  { id: 'BETWEEN_SET', label: 'Between-Set Interval', defaultDuration: 180 },
  { id: 'TECHNICAL_TIMEOUT', label: 'Technical Timeout', defaultDuration: 60 },
  { id: 'MATCH_SUSPENSION', label: 'Match Suspension', defaultDuration: 0 },
] as const;

function scorebugPatchFrom(cfg: any) {
  return {
    visible: !!cfg.visible,
    position: cfg.position || 'top-left',
    scale: Number(cfg.scale) || 1,
    variant: cfg.variant || 'classic',
    showSetHistory: !!cfg.showSetHistory,
    showPreMatch: cfg.showPreMatch !== false,
    showLogos: cfg.showLogos !== false,
    showTournament: cfg.showTournament !== false,
    tournamentLabel: (cfg.tournamentLabel ?? '').toString(),
  };
}

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

export const BroadcastStudioPage: React.FC = () => {
  const notify = useNotification();
  const qc = useQueryClient();
  const socket = getSocket();
  const navigate = useNavigate();
  const { currentMatchId, currentMatch, setCurrentMatchId, matches } = useCurrentMatch();
  const [scorebugCfg, setScorebugCfg] = useState<any>(scorebugDefaults);
  const [scorebugSave, setScorebugSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [selectedTemplate, setSelectedTemplate] = useState('TEAM_COMPARISON');
  const [duration, setDuration] = useState<string>('0');
  const [breakType, setBreakType] = useState<string>('TEAM_A_TIMEOUT');
  const [breakDuration, setBreakDuration] = useState<string>('30');
  const [baseUrl, setBaseUrl] = useState('');
  const [graphicsMode, setGraphicsMode] = useState<'direct' | 'preview_take'>(() => { try { return (localStorage.getItem('qwesie.graphicsMode') as any) === 'preview_take' ? 'preview_take' : 'direct'; } catch { return 'direct'; } });
  const [previewState, setPreviewState] = useState<{ cue: any; version: number }>({ cue: null, version: 0 });
  const [socketHealthy, setSocketHealthy] = useState(socket.connected);
  const debounceRef = useRef<any>(null);
  const saveSeqRef = useRef(0);

  const matchId = currentMatchId || '';
  const court = String(currentMatch?.court || '').trim() || '1';
  const [courtOnAir, setCourtOnAirState] = useState<any>(null);

  useEffect(() => {
    const c = String(currentMatch?.court || '').trim();
    if (!c) { setCourtOnAirState(null); return; }
    let alive = true;
    const load = async () => { try { const r = await systemApi.activeCourtMatch(c); if (alive) setCourtOnAirState(r); } catch { if (alive) setCourtOnAirState(null); } };
    load(); const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [currentMatch?.court, matchId]);

  useEffect(() => {
    let alive = true;
    const load = () => resolveOutputBaseUrl({ forceLan: true }).then(r => { if (alive) setBaseUrl(r.baseUrl); }).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Join match room as console and subscribe to real-time scene/graphic state
  useEffect(() => {
    if (!matchId) return;
    let joined = false;
    let healthyTimer: any = null;
    const markHealthy = () => setSocketHealthy(true);
    const markUnhealthy = () => setSocketHealthy(false);
    const join = () => {
      if (!socket.connected) return;
      socket.emit(SOCKET_EVENTS.MATCH_JOIN, { matchId, clientType: 'console' });
      joined = true;
      setSocketHealthy(true);
    };
    const onConnect = () => join();
    const onDisconnect = () => markUnhealthy();
    const onConnectError = () => markUnhealthy();
    const onHeartbeat = () => {
      markHealthy();
      if (healthyTimer) clearTimeout(healthyTimer);
      healthyTimer = setTimeout(() => setSocketHealthy(false), 12000);
    };
    const onScene = (s: any) => {
      if (!s || (s.matchId && s.matchId !== matchId)) return;
      qc.setQueryData(['broadcast-scene', matchId], s);
      if (s.scorebug) setScorebugCfg((prev: any) => mergeScorebugFromServer(prev, s.scorebug));
    };
    const onGraphic = (g: any) => {
      if (!g || (g.matchId && g.matchId !== matchId)) return;
      qc.setQueryData(['broadcast-graphic', matchId], g);
    };
    const onPreview = (p: any) => { if (p?.matchId === matchId) setPreviewState({ cue: p.cue || null, version: p.version || 0 }); };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on(SOCKET_EVENTS.HEARTBEAT as any, onHeartbeat);
    socket.on(SOCKET_EVENTS.OUTPUT_SCENE_STATE as any, onScene);
    socket.on(SOCKET_EVENTS.BROADCAST_GRAPHIC_STATE as any, onGraphic);
    socket.on((SOCKET_EVENTS as any).OUTPUT_PREVIEW_STATE as any, onPreview);
    join();
    healthyTimer = setTimeout(() => { if (!socket.connected) setSocketHealthy(false); }, 2000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (healthyTimer) clearTimeout(healthyTimer);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off(SOCKET_EVENTS.HEARTBEAT as any, onHeartbeat);
      socket.off(SOCKET_EVENTS.OUTPUT_SCENE_STATE as any, onScene);
      socket.off(SOCKET_EVENTS.BROADCAST_GRAPHIC_STATE as any, onGraphic);
      socket.off((SOCKET_EVENTS as any).OUTPUT_PREVIEW_STATE as any, onPreview);
      try { if (joined) socket.emit(SOCKET_EVENTS.MATCH_LEAVE, matchId); } catch {}
    };
  }, [matchId, socket, qc]);

  const pollMs = socketHealthy ? false : 4000;
  const { data: templates = [] } = useQuery({ queryKey: ['broadcast-templates'], queryFn: broadcastApi.getTemplates });
  const { data: graphicState, refetch: refetchGraphic } = useQuery({
    queryKey: ['broadcast-graphic', matchId],
    queryFn: () => broadcastApi.getGraphicState(matchId),
    enabled: !!matchId,
    refetchInterval: pollMs as any,
  });
  const { data: sceneState } = useQuery({
    queryKey: ['broadcast-scene', matchId],
    queryFn: () => broadcastApi.getSceneState(matchId),
    enabled: !!matchId,
    refetchInterval: pollMs as any,
  });

  // Authoritative server sync (server is source of truth)
  useEffect(() => {
    if (!sceneState?.scorebug) return;
    setScorebugCfg((prev: any) => mergeScorebugFromServer(prev, sceneState.scorebug));
  }, [sceneState]);

  const applyScorebug = useCallback(async (nextCfg: any) => {
    if (!matchId) return;
    const seq = ++saveSeqRef.current;
    setScorebugSave('saving');
    try {
      const res = await broadcastApi.setScene(matchId, { scorebug: scorebugPatchFrom(nextCfg) });
      if (saveSeqRef.current !== seq) return;
      qc.setQueryData(['broadcast-scene', matchId], res);
      if (res?.scorebug) setScorebugCfg((prev: any) => mergeScorebugFromServer(prev, res.scorebug));
      setScorebugSave('saved');
      setTimeout(() => { if (saveSeqRef.current === seq) setScorebugSave('idle'); }, 1500);
    } catch (e: any) {
      if (saveSeqRef.current !== seq) return;
      setScorebugSave('error');
      notify.error(e?.message || 'Failed to apply scorebug settings');
    }
  }, [matchId, qc, notify]);

  const scheduleScorebugApply = useCallback((nextCfg: any) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void applyScorebug(nextCfg); }, 300);
  }, [applyScorebug]);

  const updateScorebug = useCallback((patch: Partial<typeof scorebugDefaults>) => {
    setScorebugCfg((prev: any) => {
      const next = { ...prev, ...patch };
      scheduleScorebugApply(next); // optimistic UI + debounced server apply
      return next;
    });
  }, [scheduleScorebugApply]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const setGraphicMutation = useMutation({
    mutationFn: (body: { template: string; visible?: boolean; payload?: any; durationSeconds?: number | null }) => broadcastApi.setGraphicState(matchId, body),
    onSuccess: (data) => { qc.setQueryData(['broadcast-graphic', matchId], data); notify.success(`Graphic updated: ${String(data.activeTemplate).replace(/_/g, ' ')}`); },
    onError: (e: Error) => notify.error(e.message),
  });
  const dismissMutation = useMutation({
    mutationFn: () => broadcastApi.dismissGraphic(matchId),
    onSuccess: (data) => { qc.setQueryData(['broadcast-graphic', matchId], data); notify.info('Graphic dismissed, returned to scorebug/clear output'); },
    onError: (e: Error) => notify.error(e.message),
  });
  const startBreakMutation = useMutation({
    mutationFn: (body: { type: string; durationSeconds?: number | null }) => broadcastApi.startBreak(matchId, body),
    onSuccess: (data) => { qc.setQueryData(['broadcast-graphic', matchId], data); notify.success(`Break started: ${data.breakState?.label || breakType}`); },
    onError: (e: Error) => notify.error(e.message),
  });
  const endBreakMutation = useMutation({
    mutationFn: () => broadcastApi.endBreak(matchId),
    onSuccess: (data) => { qc.setQueryData(['broadcast-graphic', matchId], data); notify.info('Break ended (graphic state preserved until resume/dismiss)'); },
    onError: (e: Error) => notify.error(e.message),
  });
  const resumeMutation = useMutation({
    mutationFn: () => broadcastApi.resumeMatch(matchId),
    onSuccess: (data) => {
      if (data?.scene) qc.setQueryData(['broadcast-scene', matchId], data.scene);
      if (data?.match?.id) {
        qc.setQueryData(['match', data.match.id], data.match);
      }
      qc.invalidateQueries({ queryKey: ['broadcast-graphic', matchId] });
      qc.invalidateQueries({ queryKey: ['matches'] });
      notify.success('Match resumed: scorebug restored, full-screen dismissed, displays synchronized');
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const b = baseUrl || window.location.origin;
  const outUrls = useMemo(() => ({
    scorebug: buildCourtOutputUrl(b, court, 'scorebug'),
    graphics: buildCourtOutputUrl(b, court, 'graphics'),
    all: buildCourtOutputUrl(b, court, 'all'),
  }), [b, court]);

  // Real previews (actual selected match + selected template). Sample data only via explicit demo flag.
  const previewScorebugUrl = matchId ? `${window.location.origin}/broadcast/${matchId}/scorebug?preview=1` : '';
  const previewGraphicsUrl = matchId ? `${window.location.origin}/broadcast/${matchId}/graphics?preview=1&template=${encodeURIComponent(selectedTemplate)}` : '';

  const copy = async (text: string, msg: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) notify.success(msg);
    else notify.error('Copy failed. Copy the link manually.');
  };

  const active = graphicState?.activeTemplate || 'SCOREBUG';
  const activeVisible = !!graphicState?.visible && active !== 'SCOREBUG';
  const breakState = graphicState?.breakState;
  const breakActive = !!breakState?.active;
  const suggested = (breakState?.suggestedTemplates || []) as string[];
  const programOnAir = !!(sceneState?.template || (sceneState?.scene && sceneState.scene !== 'PLAY'));
  const onAirGraphicName = sceneState?.template ? String(sceneState.template).replace(/_/g, ' ') : (sceneState?.scene && sceneState.scene !== 'PLAY' ? String(sceneState.scene).replace(/_/g, ' ') : 'Scorebug');
  const previewPending = graphicsMode === 'preview_take' && !!previewState.cue && ((previewState.cue.template || null) !== (sceneState?.template || null));

  const loadPreviewCue = async (template: string) => {
    if (!matchId) return;
    const cue = { template: template === 'SCOREBUG' ? null : template, payload: breakActive ? { breakType: breakState?.type, breakLabel: breakState?.label } : {}, duration: Number(duration) || null, autoReturn: !!(Number(duration) || 0) };
    try {
      const res = await broadcastApi.setPreview(matchId, cue as any);
      setPreviewState({ cue: res?.cue || cue, version: res?.version || Date.now() });
      if (graphicsMode === 'direct') {
        const taken = await broadcastApi.take(matchId);
        if (taken?.scene) qc.setQueryData(['broadcast-scene', matchId], taken.scene);
        qc.invalidateQueries({ queryKey: ['broadcast-graphic', matchId] });
      }
    } catch (e: any) { notify.error(e?.message || 'Failed to update program'); }
  };
  const activateTemplate = (template: string) => {
    if (!matchId) return;
    if (graphicsMode === 'preview_take') { void loadPreviewCue(template); return; }
    // Direct mode: use preview+take for consistent program output
    void loadPreviewCue(template);
  };
  const takePreview = async () => {
    if (!matchId) return;
    try {
      const res = await broadcastApi.take(matchId);
      if (res?.scene) qc.setQueryData(['broadcast-scene', matchId], res.scene);
      qc.invalidateQueries({ queryKey: ['broadcast-graphic', matchId] });
    } catch (e: any) { notify.error(e?.message || 'Take failed'); }
  };
  const clearProgramOut = async () => {
    if (!matchId) return;
    try {
      const res = await broadcastApi.clear(matchId);
      if (res?.scene) qc.setQueryData(['broadcast-scene', matchId], res.scene);
      qc.invalidateQueries({ queryKey: ['broadcast-graphic', matchId] });
    } catch (e: any) { notify.error(e?.message || 'Clear failed'); }
  };

  const renderObsUrlRow = (label: string, url: string, opts?: { primary?: boolean }) => (
    <div key={label} className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-fg">{label}</div>
        <div className="text-[11px] text-fg-subtle">{opts?.primary ? <>Following: <span className="text-fg">{onAirLabel || 'no on-air match'}</span></> : 'Stable court URL'}</div>
      </div>
      <Input readOnly value={url} className="font-mono text-xs" />
      <div className="flex flex-wrap gap-2">
        {opts?.primary ? <Button size="sm" variant="secondary" onClick={()=>copy(url, 'OBS URL copied')} disabled={!url}><Copy className="w-4 h-4" />Copy OBS URL</Button> : null}
        <Button size="sm" variant="outline" onClick={()=>window.open(withOverlayBg(url, 'checker'), '_blank')} disabled={!url}><ExternalLink className="w-4 h-4" />Open preview (checkerboard)</Button>
      </div>
      {opts?.primary && <div className="text-xs text-fg-muted">OBS: 1920x1080, FPS 30, Custom CSS blank, Shutdown source when not visible: Off, Refresh browser when scene becomes active: Off.</div>}
    </div>
  );

  const onAirMatch = courtOnAir?.match || null;
  const onAirMatchId = courtOnAir?.matchId || onAirMatch?.id || null;
  const onAirLabel = onAirMatch ? `#${onAirMatch.matchNumber || '?'} ${onAirMatch.homeTeamName || 'Home'} vs ${onAirMatch.awayTeamName || 'Away'}${onAirMatch.status ? ` (${onAirMatch.status})` : ''}` : null;
  const consoleDiffersFromOnAir = !!(onAirMatchId && matchId && onAirMatchId !== matchId);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Go Live" title="Broadcast Studio" description="Control scorebug, graphics, and break presentations for the current match." />

      {(onAirLabel || consoleDiffersFromOnAir) && (
        <div className={`rounded-lg border px-3 py-2 text-xs flex flex-wrap items-center gap-2 ${consoleDiffersFromOnAir ? 'border-warning/40 bg-warning-subtle text-warning' : 'border-border bg-surface-alt text-fg-muted'}`}>
          <span className="font-semibold">On air for Court {court}:</span>
          <span className="text-fg">{onAirLabel || 'No on-air match assigned'}</span>
          {consoleDiffersFromOnAir && <span className="text-warning">Console is controlling a different match.</span>}
          {consoleDiffersFromOnAir && onAirMatchId && (
            <Button size="sm" variant="outline" onClick={() => setCurrentMatchId(onAirMatchId, { explicit: true })}>Switch console to on-air match</Button>
          )}
          {consoleDiffersFromOnAir && (
            <Button size="sm" variant="secondary" onClick={async () => { try { await systemApi.setActiveCourtMatch(court, matchId); const r = await systemApi.activeCourtMatch(court); setCourtOnAirState(r); notify.success('This match is now on air for the court'); } catch (e: any) { notify.error(e?.message || 'Failed to set on-air match'); } }}>Make this match on-air</Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Graphics Control Panel</CardTitle><Tv2 className="w-4 h-4 text-info" /></CardHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label>Current Match</Label>
                <Select value={matchId} onChange={(e)=>setCurrentMatchId(e.target.value || null)}>
                  {matches.length === 0 && <option value="">No matches</option>}
                  {matches.map((m: any) => <option key={m.id} value={m.id}>#{m.match_no || '?'} — {m.teams?.A?.name} vs {m.teams?.B?.name} ({m.status}) · {m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString() : (m.match_date || 'unscheduled')}{m.court ? ` · ${m.court}` : ''}</option>)}
                </Select>
                <div className="text-xs text-fg-subtle mt-1">Court: <span className="font-semibold text-fg-muted">{court}</span> (stable outputs follow this court)</div>
              </div>
              <div><Label>Active Broadcast Graphic</Label><div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${activeVisible ? 'bg-success-subtle border-success/30 text-success' : 'bg-surface-raised border-border text-fg-muted'}`}>{activeVisible ? String(active).replace(/_/g, ' ') : 'Scorebug / Clear Output'}</div>{breakActive && <div className="text-xs text-warning mt-1">Break: {breakState?.label}{breakState?.durationSeconds ? ` (${breakState.durationSeconds}s)` : ''}</div>}</div>
            </div>

            <div className="rounded-xl border border-warning/30 bg-warning-subtle p-4 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-semibold text-warning"><Coffee className="w-4 h-4 text-warning" /> Match Break & Full-screen Statistics Presentation</div>
                <div className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${breakActive ? 'bg-warning-subtle border-warning/40 text-warning' : 'bg-surface-raised border-border text-fg-muted'}`}>{breakActive ? `ACTIVE: ${breakState?.label}` : 'Live play (no active break)'}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2"><Label>Break Type</Label>
                  <Select value={breakType} onChange={(e)=>{ const v=e.target.value; setBreakType(v); const def = BREAK_TYPES.find(b=>b.id===v)?.defaultDuration ?? 30; setBreakDuration(String(def)); }}>
                    {BREAK_TYPES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </Select>
                </div>
                <div><Label>Break Duration (seconds, 0 = manual)</Label><Input type="number" min={0} value={breakDuration} onChange={(e)=>setBreakDuration(e.target.value)} /></div>
                <div className="flex items-end gap-2">
                  <Button variant="primary" className="w-full" onClick={()=>startBreakMutation.mutate({ type: breakType, durationSeconds: Number(breakDuration)||null })} disabled={!matchId || startBreakMutation.isPending}><TimerReset className="w-4 h-4" /> Start Break</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={()=>endBreakMutation.mutate()} disabled={!matchId || !breakActive || endBreakMutation.isPending}>End Break State</Button>
                <Button variant="secondary" onClick={()=>resumeMutation.mutate()} disabled={!matchId || resumeMutation.isPending}><RotateCcw className="w-4 h-4" /> Resume Match (restore scorebug)</Button>
              </div>
              {breakActive && (
                <div className="rounded-lg border border-warning/30 bg-surface-sunken p-3 space-y-2">
                  <div className="text-sm font-semibold text-warning">Suggested graphics for this break</div>
                  <div className="flex flex-wrap gap-2">
                    {suggested.map(id => {
                      const t = templates.find((x:any)=>x.id===id);
                      return <Button key={id} size="sm" variant={selectedTemplate===id ? 'primary':'outline'} onClick={()=>{ setSelectedTemplate(id); activateTemplate(id); }} disabled={setGraphicMutation.isPending}>{t?.name || id.replace(/_/g,' ')}</Button>;
                    })}
                    {suggested.length===0 && <div className="text-xs text-fg-muted">No suggestions available.</div>}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-surface-subtle/30 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm font-semibold text-fg">Graphic Selection & Operator Actions</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex rounded-lg border border-border overflow-hidden">
                    <button type="button" className={`px-2.5 py-1 text-xs font-semibold ${graphicsMode==='direct' ? 'bg-accent text-accent-fg' : 'bg-surface-sunken text-fg-muted'}`} onClick={()=>{ setGraphicsMode('direct'); try { localStorage.setItem('qwesie.graphicsMode','direct'); } catch {} }}>Direct</button>
                    <button type="button" className={`px-2.5 py-1 text-xs font-semibold border-l border-border ${graphicsMode==='preview_take' ? 'bg-accent text-accent-fg' : 'bg-surface-sunken text-fg-muted'}`} onClick={()=>{ setGraphicsMode('preview_take'); try { localStorage.setItem('qwesie.graphicsMode','preview_take'); } catch {} }}>Preview then Take</button>
                  </div>
                  {programOnAir && <span className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wider text-danger px-2 py-0.5 rounded border border-danger/40 bg-danger-subtle"><span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />ON AIR: {onAirGraphicName}</span>}
                  <Button variant="outline" size="sm" onClick={()=>{ void refetchGraphic(); qc.invalidateQueries({ queryKey: ['broadcast-scene', matchId] }); }}><RefreshCw className="w-3.5 h-3.5" /> Refresh State</Button>
                </div>
              </div>
              {graphicsMode === 'preview_take' && previewPending && (
                <div className="rounded-lg border border-warning/40 bg-warning-subtle text-warning px-3 py-2 text-xs font-semibold">Loaded in Preview. Press TAKE (Enter) to send to OBS.</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2"><Label>Template</Label><Select value={selectedTemplate} onChange={(e)=>setSelectedTemplate(e.target.value)}>{templates.map((t:any)=> <option key={t.id} value={t.id}>{t.name}</option>)}</Select><p className="text-xs text-fg-subtle mt-1">{templates.find((t:any)=>t.id===selectedTemplate)?.description}</p></div>
                <div><Label>Display Duration (seconds, 0 = manual)</Label><Input type="number" min={0} value={duration} onChange={(e)=>setDuration(e.target.value)} /></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={()=>window.open(withOverlayBg(previewGraphicsUrl, 'checker'),'_blank')} disabled={!matchId}><Eye className="w-4 h-4" /> Preview (selected template)</Button>
                <Button variant="primary" className={previewPending ? 'animate-pulse ring-2 ring-warning/60' : ''} onClick={()=> graphicsMode === 'preview_take' && previewPending ? void takePreview() : activateTemplate(selectedTemplate)} disabled={!matchId}><Play className="w-4 h-4" /> {graphicsMode === 'preview_take' ? (previewPending ? 'TAKE to OBS' : 'Load to Preview') : 'Activate / Replace'}</Button>
                {graphicsMode === 'preview_take' && <Button variant="primary" onClick={()=>void takePreview()} disabled={!matchId || !previewPending}>TAKE (Enter)</Button>}
                <Button variant="danger" onClick={()=>void clearProgramOut()} disabled={!matchId}><Square className="w-4 h-4" /> Clear / Dismiss</Button>
                <Button variant="outline" onClick={()=>{ setSelectedTemplate('SCOREBUG'); void loadPreviewCue('SCOREBUG'); }} disabled={!matchId}>Return to Scorebug</Button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface-subtle/30 p-4">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-semibold text-fg"><SlidersHorizontal className="w-4 h-4 text-info" /> Scorebug Configuration</div>
                <div className={`text-xs px-2 py-1 rounded-full border ${scorebugSave==='saving' ? 'border-info/40 text-info bg-info/10' : scorebugSave==='saved' ? 'border-success/40 text-success bg-success-subtle' : scorebugSave==='error' ? 'border-danger/40 text-danger bg-danger-subtle' : 'border-border text-fg-muted bg-surface-sunken'}`}>
                  {scorebugSave==='saving' ? 'Applying…' : scorebugSave==='saved' ? 'Saved & applied' : scorebugSave==='error' ? 'Error applying' : 'Live (server authoritative)'}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><Label>Visibility</Label><Select value={String(scorebugCfg.visible)} onChange={(e)=>updateScorebug({ visible: e.target.value==='true' })}><option value="true">Visible</option><option value="false">Hidden</option></Select></div>
                <div><Label>Display</Label><Select value={scorebugCfg.variant || 'classic'} onChange={(e)=>updateScorebug({ variant: e.target.value })}><option value="classic">Classic (full)</option><option value="compact">Compact</option><option value="wide">Wide (full)</option></Select></div>
                <div><Label>Position</Label><Select value={scorebugCfg.position} onChange={(e)=>updateScorebug({ position: e.target.value })}><option value="top-left">Top Left</option><option value="top-right">Top Right</option><option value="bottom-left">Bottom Left</option><option value="bottom-right">Bottom Right</option></Select></div>
                <div><Label>Scale</Label><Select value={String(scorebugCfg.scale)} onChange={(e)=>updateScorebug({ scale: Number(e.target.value) })}><option value="0.85">85%</option><option value="1">100%</option><option value="1.1">110%</option><option value="1.25">125%</option><option value="1.5">150%</option></Select></div>
                <div><Label>Set History</Label><Select value={String(!!scorebugCfg.showSetHistory)} onChange={(e)=>updateScorebug({ showSetHistory: e.target.value==='true' })}><option value="true">Show</option><option value="false">Hide</option></Select></div>
                <div><Label>Show Pre-Match</Label><Select value={String(scorebugCfg.showPreMatch !== false)} onChange={(e)=>updateScorebug({ showPreMatch: e.target.value==='true' })}><option value="true">Show</option><option value="false">Hide</option></Select></div>
                <div><Label>Team Logos</Label><Select value={String(scorebugCfg.showLogos !== false)} onChange={(e)=>updateScorebug({ showLogos: e.target.value==='true' })}><option value="true">Show</option><option value="false">Hide</option></Select></div>
                <div><Label>Tournament Label</Label><Select value={String(scorebugCfg.showTournament !== false)} onChange={(e)=>updateScorebug({ showTournament: e.target.value==='true' })}><option value="true">Show</option><option value="false">Hide</option></Select></div>
                <div className="md:col-span-3"><Label>Tournament Label Override</Label><Input value={scorebugCfg.tournamentLabel ?? ''} onChange={(e)=>updateScorebug({ tournamentLabel: e.target.value })} placeholder="Leave empty to use match tournament" /></div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button variant="outline" onClick={()=>window.open(withOverlayBg(previewScorebugUrl, 'checker'),'_blank')} disabled={!matchId}><ExternalLink className="w-4 h-4" /> Preview scorebug (real match)</Button>
              </div>
              <div className="text-xs text-fg-subtle mt-2">Scorebug settings apply live to outputs (debounced) and are stored on the server. Preview renders the selected match with current settings.</div>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>OBS Outputs (stable court URLs)</CardTitle><MonitorPlay className="w-4 h-4 text-info" /></CardHeader>
            <div className="space-y-3 text-sm">
              {renderObsUrlRow('All-in-one (Scorebug + Graphics)', outUrls.all, { primary: true })}
              <details className="text-xs text-fg-subtle">
                <summary className="cursor-pointer">Other stable court outputs (preview only)</summary>
                <div className="mt-2 space-y-2">
                  {renderObsUrlRow('Scorebug', outUrls.scorebug)}
                  {renderObsUrlRow('Graphics', outUrls.graphics)}
                </div>
              </details>
              <p className="text-xs text-fg-subtle">Paste once in OBS. This follows the active match on court <span className="font-semibold">{court}</span>. No state is baked into the URL.</p>
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Available Templates</CardTitle></CardHeader>
            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {templates.map((t:any)=>(
                <button key={t.id} onClick={()=>setSelectedTemplate(t.id)} className={`w-full text-left rounded-lg border p-3 transition ${selectedTemplate===t.id ? 'border-info/40 bg-info/10' : 'border-border bg-surface-sunken/50 hover:bg-surface-alt'}`}>
                  <div className="text-sm font-semibold text-fg">{t.name}</div>
                  <div className="text-xs text-fg-muted mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

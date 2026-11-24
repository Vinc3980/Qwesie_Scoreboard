import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ScaledStage, ConnectionGuard, OutputErrorBoundary } from '../components/broadcast/index.js';
import { ScorebugOverlay } from '../components/broadcast/ScorebugOverlay.js';
import { useOutputStream } from '../hooks/useOutputStream.js';
import { systemApi } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { SOCKET_EVENTS } from '@qwesie/shared';
import { SCENE_COMPONENTS, TEMPLATE_COMPONENTS } from '../features/broadcast/templates.js';
import { parseOverlayBg } from '../utils/overlay.js';

const EASE = [0.22, 1, 0.36, 1] as const;
const GRAPHIC_TRANSITION = { duration: 0.5, ease: EASE };
const SCENES_WITH_GRAPHIC = new Set(['SET_BREAK', 'TIMEOUT', 'MATCH_STATS', 'LINEUPS', 'HEAD_TO_HEAD', 'PLAYER_SPOTLIGHT', 'MATCH_MOMENTUM', 'FINAL', 'BREAK_SLATE']);

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function normStatus(match: any, fallback?: string | null) { return String(match?.status || fallback || '').toUpperCase(); }

type TeamKey = 'A' | 'B';

function useScoreFlash(m: any) {
  const prevScores = useRef<{A:number;B:number} | null>(null);
  const [scoreFlash, setScoreFlash] = useState<TeamKey | null>(null);
  useEffect(() => {
    if (!m) return;
    const a = m.teams?.A?.score ?? 0; const b = m.teams?.B?.score ?? 0;
    const prev = prevScores.current;
    if (prev) {
      if (a > prev.A) { setScoreFlash('A'); window.setTimeout(() => setScoreFlash(curr => curr === 'A' ? null : curr), 700); }
      else if (b > prev.B) { setScoreFlash('B'); window.setTimeout(() => setScoreFlash(curr => curr === 'B' ? null : curr), 700); }
    }
    prevScores.current = { A: a, B: b };
  }, [m?.teams?.A?.score, m?.teams?.B?.score, m?.id]);
  return scoreFlash;
}

function useBanner(m: any, scene: any, revision: number) {
  const [banner, setBanner] = useState<{ text: string; color?: string; textColor?: string } | null>(null);
  const bannerKey = useRef<string>('');
  useEffect(() => {
    if (!m) { setBanner(null); return; }
    const f = m.flags || {};
    let next: { text: string; color?: string; textColor?: string } | null = null;
    let key = '';
    const teamName = (side: TeamKey | null) => side ? (m.teams?.[side]?.shortName || m.teams?.[side]?.name || `TEAM ${side}`) : '';
    const themeCfg: any = (scene?.scorebug?.theme || scene?.scorebugTheme?.config || null);
    const mpColor = themeCfg?.colors?.matchPointAccent || (f.matchPoint ? 'var(--team-' + f.matchPoint.toLowerCase() + ')' : undefined);
    const spColor = themeCfg?.colors?.setPointAccent || (f.setPoint ? 'var(--team-' + f.setPoint.toLowerCase() + ')' : undefined);
    if (f.matchPoint) { key = `mp-${f.matchPoint}-${m.current_set}-${m.teams?.[f.matchPoint]?.score}`; next = { text: `MATCH POINT - ${teamName(f.matchPoint)}`, color: mpColor, textColor: '#fff' }; }
    else if (f.setPoint) { key = `sp-${f.setPoint}-${m.current_set}-${m.teams?.[f.setPoint]?.score}`; next = { text: `SET POINT - ${teamName(f.setPoint)}`, color: spColor, textColor: '#fff' }; }
    else if (f.setWon) { key = `sw-${f.setWon}-${m.current_set}`; next = { text: 'SET WON', color: 'var(--team-' + f.setWon.toLowerCase() + ')', textColor: 'var(--team-' + f.setWon.toLowerCase() + '-text)' }; }
    else if (f.courtSwitchDue) { key = `cs-${m.current_set}-${m.teams?.A?.score}-${m.teams?.B?.score}`; next = { text: 'COURT SWITCH', color: '#334155', textColor: '#fff' }; }

    const le = m.lastEvent;
    const lastEventType = String(le?.action || le?.payload?.type || '').toUpperCase();
    const lastPayload = le?.payload || {};
    if (!next && (lastEventType.includes('TIMEOUT_CALLED') || lastEventType.includes('TIMEOUT'))) {
      const side = (le?.team || (lastPayload.teamSide === 'HOME' ? 'A' : lastPayload.teamSide === 'AWAY' ? 'B' : null)) as TeamKey | null;
      const isTech = /TECHNICAL/i.test(JSON.stringify(lastPayload)) || (scene?.scene === 'TIMEOUT' && /TECHNICAL/i.test(String(scene?.payload?.type || '')));
      if (isTech) { key = `tt-${le?.id || le?.seq || revision}`; next = { text: 'TECHNICAL TIMEOUT', color: '#334155', textColor: '#fff' }; }
      else if (side) { key = `to-${side}-${le?.id || le?.seq || revision}`; next = { text: `TIMEOUT - ${teamName(side)}`, color: 'var(--team-' + side.toLowerCase() + ')', textColor: 'var(--team-' + side.toLowerCase() + '-text)' }; }
    }

    if (next && key && key !== bannerKey.current) {
      bannerKey.current = key;
      setBanner(next);
      const transient = /SET WON|TIMEOUT|COURT SWITCH/.test(next.text);
      if (transient) {
        const t = window.setTimeout(() => setBanner(curr => (curr?.text === next!.text ? null : curr)), 5000);
        return () => window.clearTimeout(t);
      }
    } else if (!next) {
      if (/MATCH POINT|SET POINT/.test(banner?.text || '')) setBanner(null);
      bannerKey.current = key;
    }
  }, [m?.flags?.setPoint, m?.flags?.matchPoint, m?.flags?.setWon, m?.flags?.courtSwitchDue, m?.lastEvent?.id, m?.lastEvent?.seq, m?.teams?.A?.score, m?.teams?.B?.score, scene?.scene, revision]);
  return banner;
}

function isFullScreenGraphic(scene: any, status: string) {
  const raw = String(scene?.scene || 'PLAY');
  const activeScene = status === 'COMPLETED' && raw === 'PLAY' ? 'FINAL' : raw;
  const template = scene?.template || (status === 'COMPLETED' && raw === 'PLAY' ? 'FINAL_MATCH_RESULT' : null);
  const hasGraphic = !!template || (activeScene !== 'PLAY' && SCENES_WITH_GRAPHIC.has(activeScene));
  return hasGraphic && activeScene !== 'PLAY';
}

function ScorebugInner({ stream, status, hiddenByGraphic = false }: { stream: any; status: string; hiddenByGraphic?: boolean }) {
  const { match, scene } = stream;
  const settings = useMemo(() => {
    const s = scene?.scorebug || {};
    const variant = String(s.variant || 'classic').toLowerCase();
    const normalizedVariant = variant === 'compact' ? 'compact' : variant === 'wide' ? 'wide' : 'classic';
    const position = String(s.position || 'top-left').toLowerCase();
    const scale = clamp(Number(s.scale || 1) || 1, 0.5, 2);
    return {
      visible: s.visible !== false,
      variant: normalizedVariant as 'classic'|'compact'|'wide',
      position,
      scale,
      showSetHistory: !!s.showSetHistory,
      showPreMatch: !!s.showPreMatch,
      showLogos: s.showLogos !== false,
      showTournament: s.showTournament !== false,
      tournamentLabel: s.tournamentLabel ?? null,
      theme: s.theme || scene?.scorebugTheme?.config || null,
      themeId: s.themeId || scene?.scorebugTheme?.id || null,
      themeVersion: s.themeVersion || scene?.scorebugTheme?.version || null,
      themeName: s.themeName || scene?.scorebugTheme?.name || null,
    };
  }, [scene]);
  const lastGood = useRef<any>(null);
  useEffect(() => { if (match) lastGood.current = match; }, [match]);
  const m = match || lastGood.current;
  const st = String(status || m?.status || '').toUpperCase();
  const isPreMatch = st === 'SCHEDULED' || st === 'READY';
  const isTerminal = st === 'COMPLETED' || st === 'FINISHED' || st === 'CANCELLED';
  const shouldShow = !hiddenByGraphic && !!m && settings.visible && !isTerminal && (!isPreMatch || !!settings.showPreMatch);
  const scoreFlash = useScoreFlash(m);
  const banner = useBanner(m, scene, stream.revision || 0);
  const pos = String(settings.position || 'top-left');
  const slideX = pos.includes('right') ? 80 : -80;
  return (
    <AnimatePresence initial={false}>
      {shouldShow ? (
        <motion.div
          key="scorebug-wrap"
          initial={{ opacity: 0, x: slideX }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: slideX }}
          transition={{ duration: 0.35, ease: EASE }}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40 }}
        >
          <ScorebugOverlay
            match={m}
            settings={settings}
            status={st}
            scoreFlash={scoreFlash}
            banner={banner}
            forceShow={true}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function GraphicsInner({ stream, status }: { stream: any; status: string }) {
  const { match, scene } = stream;
  if (!match) return null;
  const raw = (scene?.scene || 'PLAY') as string;
  const activeScene = status === 'COMPLETED' && raw === 'PLAY' ? 'FINAL' : raw;
  const template = scene?.template || (status === 'COMPLETED' && raw === 'PLAY' ? 'FINAL_MATCH_RESULT' : null);
  const hasGraphic = !!template || (activeScene !== 'PLAY' && SCENES_WITH_GRAPHIC.has(activeScene));
  const C = (template && (TEMPLATE_COMPONENTS as any)[template]) || (SCENE_COMPONENTS as any)[activeScene] || (TEMPLATE_COMPONENTS as any)[activeScene] || null;
  const show = hasGraphic && activeScene !== 'PLAY' && !!C;
  const key = `${template || activeScene}:${scene?.version ?? 0}`;
  return (
    <AnimatePresence mode="wait" initial={false}>
      {show ? (
        <motion.div
          key={key}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.01 }}
          transition={GRAPHIC_TRANSITION}
          style={{ position: 'absolute', inset: 0, willChange: 'transform, opacity' }}
        >
          <C match={match} scene={scene} analytics={null} payload={scene?.payload || {}} template={template} />
        </motion.div>
      ) : (
        <motion.div key="clear" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ position: 'absolute', inset: 0 }} />
      )}
    </AnimatePresence>
  );
}

function ResolvedOutput({ court, mode }: { court: string; mode: 'scorebug'|'graphics'|'all' }) {
  const [search] = useSearchParams();
  const debug = search.get('debug') === '1';
  const bg = parseOverlayBg(search.get('bg'));
  const [courtMatch, setCourtMatch] = useState<{ matchId: string | null; status: string | null }>({ matchId: null, status: null });
  const [lastError, setLastError] = useState<string | null>(null);

  // Court outputs follow whatever match is on the court: in play → pre-match →
  // latest completed. Re-resolve on court active-match change event and poll as fallback.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await systemApi.activeCourtMatch(court);
        if (alive) setCourtMatch({ matchId: r.matchId || null, status: r.status || null });
      } catch { if (alive) setCourtMatch({ matchId: null, status: null }); }
    };
    load();
    const t = window.setInterval(load, 5000);
    const socket = getSocket();
    const onCourtChanged = (payload: any) => {
      const changedKey = String(payload?.courtKey || payload?.court || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const wantedKey = String(court || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (changedKey && wantedKey && changedKey !== wantedKey) return;
      void load();
    };
    try { socket.emit(SOCKET_EVENTS.MATCH_JOIN_COURT, court); } catch {}
    socket.on(SOCKET_EVENTS.COURT_ACTIVE_CHANGED as any, onCourtChanged);
    return () => {
      alive = false;
      window.clearInterval(t);
      try { socket.off(SOCKET_EVENTS.COURT_ACTIVE_CHANGED as any, onCourtChanged); } catch {}
    };
  }, [court]);

  const stream = useOutputStream({ matchId: courtMatch.matchId || undefined, court, clientType: mode === 'all' ? 'all' : mode === 'scorebug' ? 'scorebug' : mode === 'graphics' ? 'graphics' : 'other', debug });
  const status = normStatus(stream.match, courtMatch.status);
  const revision = stream.revision;
  const preMatch = status === 'SCHEDULED' || status === 'READY';
  const terminal = status === 'COMPLETED' || status === 'FINISHED' || status === 'CANCELLED';
  const scorebugVisible = (stream.scene?.scorebug?.visible !== false) && !terminal && (!preMatch || !!stream.scene?.scorebug?.showPreMatch);

  const debugChip = (
    <ConnectionGuard
      debug={debug}
      live={stream.live}
      connected={stream.connected}
      revision={revision}
      matchId={courtMatch.matchId}
      status={status || null}
      court={court}
      scene={stream.scene?.scene || null}
      scorebugVisible={scorebugVisible}
      lastError={lastError || stream.lastError}
      lastSnapshotAt={stream.lastSnapshotAt}
    />
  );

  if (!courtMatch.matchId) {
    return <ScaledStage hideCursor bg={bg}>{debugChip}</ScaledStage>;
  }

  const fullScreen = isFullScreenGraphic(stream.scene, status);
  return (
    <ScaledStage match={stream.match || undefined} hideCursor bg={bg}>
      <div style={{ width: 1920, height: 1080, position: 'relative', background: 'transparent', fontFamily: '"Barlow Condensed", Inter, sans-serif' }}>
        <OutputErrorBoundary onError={setLastError} resetKey={`${revision}:${mode}:${stream.scene?.version ?? 0}`}>
          {mode === 'scorebug' && <ScorebugInner stream={stream} status={status} />}
          {mode === 'graphics' && <GraphicsInner stream={stream} status={status} />}
          {mode === 'all' && (<><GraphicsInner stream={stream} status={status} /><ScorebugInner stream={stream} status={status} hiddenByGraphic={fullScreen} /></>)}
        </OutputErrorBoundary>
        {debugChip}
      </div>
    </ScaledStage>
  );
}

function DemoOutput({ court, mode }: { court: string; mode: 'scorebug' | 'graphics' | 'all' | 'test' }) {
  const [search] = useSearchParams();
  const debug = search.get('debug') === '1';
  const bg = parseOverlayBg(search.get('bg'));
  const demoMatch: any = {
    id: 'demo', status: 'LIVE', winner: null, current_set: 2, max_sets: 5, server: 'A',
    tournament: 'Demo Tournament', division: 'Division', court, match_no: 'DEMO',
    match_date: new Date().toISOString().slice(0, 10), referee1: '', referee2: '', started_at: new Date().toISOString(), ended_at: null, server_time: new Date().toISOString(),
    teams: {
      A: { name: 'HOME TEAM', shortName: 'HOME', logoUrl: null, primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#fff', score: 18, sets: 1, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: 1, stats: { kill: 10, error: 4, ace: 2, block: 3, dig: 12, assist: 9, side_out: 50 } },
      B: { name: 'AWAY TEAM', shortName: 'AWAY', logoUrl: null, primaryColor: '#1d4ed8', secondaryColor: '#0f172a', textColor: '#fff', score: 16, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: null, stats: { kill: 9, error: 5, ace: 1, block: 2, dig: 11, assist: 8, side_out: 45 } },
    },
    set_scores: { A: [25, 18, 0, 0, 0], B: [20, 16, 0, 0, 0] },
    setHistory: [{ number: 1, scoreA: 25, scoreB: 20, winner: 'A' }, { number: 2, scoreA: 18, scoreB: 16, winner: null }],
    events: [], flags: { setPoint: null, matchPoint: null, setWon: null, matchWon: null, courtSwitchDue: false, isDecidingSet: false, technicalTimeoutDue: false },
    revision: 1, lastEvent: null,
    rules: { bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, rallyScoring: true, timeoutsPerSet: 2, substitutionsPerSet: 6 },
  };
  const demoScene = { scorebug: { visible: true, variant: 'classic', position: 'top-left', scale: 1, showSetHistory: false, showPreMatch: true, showLogos: true, showTournament: true, tournamentLabel: null }, scene: 'PLAY', template: null, payload: {}, startedAt: null, lock: false, timerEndsAt: null, autoTriggers: {}, version: 1, revision: 1 };
  const stream = { match: demoMatch, scene: demoScene, live: true, connected: true, revision: 1, lastSnapshotAt: Date.now(), lastError: null, matchId: 'demo', resolvedStatus: 'LIVE' } as any;
  const status = 'LIVE';
  const debugChip = (
    <ConnectionGuard debug={debug} live={true} connected={true} revision={1} matchId="demo" status={status} court={court} scene="PLAY" scorebugVisible={true} lastError={null} lastSnapshotAt={Date.now()} />
  );
  const effectiveMode = mode === 'test' ? 'scorebug' : mode;
  return (
    <ScaledStage match={demoMatch} hideCursor bg={bg}>
      <div style={{ width: 1920, height: 1080, position: 'relative', background: 'transparent', fontFamily: '"Barlow Condensed", Inter, sans-serif' }}>
        <OutputErrorBoundary resetKey={`demo:${court}:${effectiveMode}`}>
          {effectiveMode === 'scorebug' && <ScorebugInner stream={stream} status={status} />}
          {effectiveMode === 'graphics' && <GraphicsInner stream={stream} status={status} />}
          {effectiveMode === 'all' && (<><GraphicsInner stream={stream} status={status} /><ScorebugInner stream={stream} status={status} hiddenByGraphic={isFullScreenGraphic(stream.scene, status)} /></>)}
        </OutputErrorBoundary>
        <div style={{ position: 'absolute', top: 24, right: 24, zIndex: 9999, background: mode === 'test' ? 'rgba(16,185,129,0.92)' : '#b45309', color: mode === 'test' ? '#04140d' : '#fff', padding: '10px 14px', borderRadius: 8, fontWeight: 800, letterSpacing: '0.08em', fontSize: 12 }}>
          {mode === 'test' ? `TEST OUTPUT OK · COURT ${court}` : 'SAMPLE DATA'}
        </div>
        {debugChip}
      </div>
    </ScaledStage>
  );
}

export const CourtOutputPage: React.FC = () => {
  const { court = '1', mode = 'scorebug' } = useParams();
  const [search] = useSearchParams();
  const isDemo = search.get('demo') === '1' || mode === 'test';
  const m = (mode === 'graphics' || mode === 'all' || mode === 'test') ? mode : 'scorebug';
  if (isDemo) return <DemoOutput court={court} mode={m as any} />;
  return <ResolvedOutput court={court} mode={m as any} />;
};

export default CourtOutputPage;

import React, { useMemo, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ScaledStage, ConnectionGuard, OutputErrorBoundary } from '../components/broadcast/index.js';
import { useOutputStream } from '../hooks/useOutputStream.js';
import { SCENE_COMPONENTS, TEMPLATE_COMPONENTS } from '../features/broadcast/templates.js';
import { parseOverlayBg } from '../utils/overlay.js';

const EASE = [0.22, 1, 0.36, 1] as const;
const GRAPHIC_TRANSITION = { duration: 0.5, ease: EASE };

function previewMatch(scenario: string) {
  const base: any = {
    id: 'preview', status: 'LIVE', winner: null, current_set: 3, max_sets: 5, server: 'A',
    tournament: 'Greater Accra Volleyball League', division: "Men's Division", court: 'Court 1', match_no: '24',
    match_date: '2026-11-14', referee1: '', referee2: '', started_at: new Date().toISOString(), ended_at: null, server_time: new Date().toISOString(),
    teams: {
      A: { name: 'ELWAK WINGS', shortName: 'ELW', logoUrl: '/uploads/teams/elwak-wings.svg', primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#fff', score: 24, sets: 2, timeouts: 2, timeoutsUsed: 1, timeoutsPerSet: 2, lineup: [
          { id: 'a1', jerseyNumber: 4, name: 'Kwesi Mensah', position: 'OH', isCaptain: true },
          { id: 'a2', jerseyNumber: 7, name: 'Yaw Boateng', position: 'MB' },
          { id: 'a3', jerseyNumber: 9, name: 'Kojo Asante', position: 'OPP' },
          { id: 'a4', jerseyNumber: 2, name: 'Ama Serwaa', position: 'S' },
          { id: 'a5', jerseyNumber: 11, name: 'Kofi Adu', position: 'OH' },
          { id: 'a6', jerseyNumber: 5, name: 'Nana Owusu', position: 'L', isLibero: true },
        ], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: 1, stats: { kill: 18, error: 6, ace: 4, block: 5, dig: 20, assist: 16, side_out: 55, sideout_attempts: 20, sideout_wins: 11 } },
      B: { name: 'GHANA NAVY', shortName: 'NAVY', logoUrl: '/uploads/teams/ghana-navy.svg', primaryColor: '#1d4ed8', secondaryColor: '#0f172a', textColor: '#fff', score: 22, sets: 1, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [
          { id: 'b1', jerseyNumber: 3, name: 'Joseph Tetteh', position: 'OH', isCaptain: true },
          { id: 'b2', jerseyNumber: 8, name: 'Samuel Quaye', position: 'MB' },
          { id: 'b3', jerseyNumber: 12, name: 'Daniel Martey', position: 'OPP' },
          { id: 'b4', jerseyNumber: 1, name: 'Isaac Lamptey', position: 'S' },
          { id: 'b5', jerseyNumber: 6, name: 'Michael Annan', position: 'OH' },
          { id: 'b6', jerseyNumber: 10, name: 'Peter Boadu', position: 'L', isLibero: true },
        ], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: null, stats: { kill: 15, error: 7, ace: 3, block: 6, dig: 18, assist: 14, side_out: 48, sideout_attempts: 21, sideout_wins: 10 } },
    },
    set_scores: { A: [25,23,24,0,0], B: [20,25,22,0,0] },
    setHistory: [{ number: 1, scoreA: 25, scoreB: 20, winner: 'A' }, { number: 2, scoreA: 23, scoreB: 25, winner: 'B' }, { number: 3, scoreA: 24, scoreB: 22, winner: null }],
    events: [], flags: { setPoint: null, matchPoint: null, setWon: null, matchWon: null, courtSwitchDue: false, isDecidingSet: false, technicalTimeoutDue: false },
    revision: 101, lastEvent: null,
    rules: { bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, rallyScoring: true, timeoutsPerSet: 2, substitutionsPerSet: 6 },
  };
  const m = JSON.parse(JSON.stringify(base));
  if (scenario === 'setbreak') { m.current_set = 4; m.teams.A.sets = 2; m.teams.B.sets = 1; m.setHistory = [{number:1,scoreA:25,scoreB:20,winner:'A'},{number:2,scoreA:23,scoreB:25,winner:'B'},{number:3,scoreA:25,scoreB:22,winner:'A'}]; m.set_scores={A:[25,23,25,0,0],B:[20,25,22,0,0]}; }
  else if (scenario === 'timeout') { m.teams.B.timeoutsUsed = 1; m.lastEvent = { id:'e1', seq: 40, team: 'B', action: 'TIMEOUT_CALLED', time: new Date().toISOString(), payload: { type: 'TIMEOUT_CALLED', teamSide: 'AWAY' } }; }
  else if (scenario === 'final') { m.status='FINISHED'; m.winner='A'; m.teams.A.sets=3; m.teams.B.sets=1; m.setHistory=[{number:1,scoreA:25,scoreB:20,winner:'A'},{number:2,scoreA:23,scoreB:25,winner:'B'},{number:3,scoreA:25,scoreB:22,winner:'A'},{number:4,scoreA:25,scoreB:18,winner:'A'}]; m.set_scores={A:[25,23,25,25,0],B:[20,25,22,18,0]}; }
  else if (scenario === 'momentum') { m.current_set=4; m.teams.A.sets=2; m.teams.B.sets=1; m.setHistory=[{number:1,scoreA:25,scoreB:20,winner:'A'},{number:2,scoreA:23,scoreB:25,winner:'B'},{number:3,scoreA:25,scoreB:22,winner:'A'},{number:4,scoreA:18,scoreB:16,winner:null}]; }
  else if (scenario === 'empty' || scenario === 'missing') {
    m.tournament = null; m.division = null; m.court = null; m.match_no = null;
    m.teams.A.logoUrl = null; m.teams.B.logoUrl = null; m.teams.A.shortName = 'A'; m.teams.B.shortName = 'B';
    m.teams.A.lineup = []; m.teams.B.lineup = []; m.teams.A.bench = []; m.teams.B.bench = [];
    m.teams.A.stats = { kill:0,error:0,ace:0,block:0,dig:0,assist:0,side_out:0 }; m.teams.B.stats = { kill:0,error:0,ace:0,block:0,dig:0,assist:0,side_out:0 };
    m.setHistory = []; m.set_scores = { A:[0,0,0,0,0], B:[0,0,0,0,0] };
  }
  return m;
}

// Dedicated route slugs -> server scene/template key
const TEMPLATE_TO_SCENE: Record<string, string> = {
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

const SLUG_TO_TEMPLATE: Record<string, string> = {
  'match-introduction': 'MATCH_INTRO',
  'match-intro': 'MATCH_INTRO',
  'starting-lineup': 'STARTING_LINEUP',
  'lineup': 'STARTING_LINEUP',
  'player-spotlight': 'PLAYER_SPOTLIGHT',
  'team-comparison': 'TEAM_COMPARISON',
  'match-statistics': 'MATCH_STATISTICS',
  'statistics': 'MATCH_STATISTICS',
  'set-result': 'SET_RESULT',
  'set-results': 'SET_RESULT',
  'set-analysis': 'SET_ANALYSIS',
  'match-momentum': 'MATCH_MOMENTUM',
  'momentum': 'MATCH_MOMENTUM',
  'match-result': 'FINAL_MATCH_RESULT',
  'match-results': 'FINAL_MATCH_RESULT',
  'final-result': 'FINAL_MATCH_RESULT',
  'break-slate': 'MATCH_INTRO',
  'timeout': 'MATCH_STATISTICS',
};

const SCENES_WITH_GRAPHIC = new Set(['SET_BREAK', 'TIMEOUT', 'MATCH_STATS', 'LINEUPS', 'HEAD_TO_HEAD', 'PLAYER_SPOTLIGHT', 'MATCH_MOMENTUM', 'FINAL', 'BREAK_SLATE']);

export const BroadcastGraphicsPage: React.FC = () => {
  const { matchId, templateSlug } = useParams();
  const [search] = useSearchParams();
  const location = useLocation();
  const debug = search.get('debug') === '1';
  const bg = parseOverlayBg(search.get('bg'));
  const scenario = (search.get('scenario') || '').toLowerCase();
  const sceneParam = (search.get('scene') || '').toUpperCase();
  const previewParam = search.get('template') ? String(search.get('template')).toUpperCase() : '';
  const explicitDemo = search.get('demo') === '1' || matchId === 'preview' || !!scenario;
  const previewMode = search.get('preview') === '1';
  const useSampleData = explicitDemo; // sample data only behind explicit demo/scenario/preview id
  const stream = useOutputStream({ matchId: useSampleData ? undefined : matchId, resolveCurrent: !useSampleData && !matchId, clientType: 'graphics', debug });
  const [lastError, setLastError] = useState<string | null>(null);

  const forcedTemplate = useMemo(() => {
    if (previewParam) return SLUG_TO_TEMPLATE[previewParam.toLowerCase()] || previewParam;
    if (templateSlug) {
      const raw = templateSlug.toLowerCase();
      return SLUG_TO_TEMPLATE[raw] || templateSlug.toUpperCase();
    }
    const parts = location.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last !== 'graphics' && matchId && last !== matchId) {
      const raw = last.toLowerCase();
      return SLUG_TO_TEMPLATE[raw] || raw.toUpperCase();
    }
    return '';
  }, [templateSlug, location.pathname, matchId, previewParam]);

  const forcedScene = forcedTemplate ? (TEMPLATE_TO_SCENE[forcedTemplate] || sceneParam || 'MATCH_STATS') : (sceneParam || '');

  const preview = useMemo(() => {
    if (!useSampleData) return null;
    const pmatch = previewMatch(scenario || 'normal');
    const activeScene = forcedScene || sceneParam || 'MATCH_STATS';
    const activeTemplate = forcedTemplate || (activeScene === 'MATCH_STATS' ? 'MATCH_STATISTICS' : activeScene === 'FINAL' ? 'FINAL_MATCH_RESULT' : null);
    const ps: any = {
      matchId: 'preview',
      scene: activeScene,
      template: activeTemplate,
      payload: {},
      startedAt: new Date().toISOString(),
      scorebug: { visible: true, variant: 'classic', position: 'top-left', scale: 1, showSetHistory: false, showPreMatch: true },
      lock: false,
      timerEndsAt: scenario === 'timeout' ? new Date(Date.now() + 28000).toISOString() : scenario === 'setbreak' ? new Date(Date.now() + 45000).toISOString() : null,
      autoTriggers: {},
      version: 1,
      revision: 101,
    };
    return { match: pmatch, scene: ps, live: true, connected: true, revision: 101 };
  }, [useSampleData, scenario, sceneParam, forcedScene, forcedTemplate]);

  const match = useSampleData ? (preview as any)?.match : stream.match;
  const live = useSampleData ? true : stream.live;
  const connected = useSampleData ? true : stream.connected;
  const revision = useSampleData ? (preview as any)?.revision : stream.revision;

  const baseScene = useSampleData ? (preview as any)?.scene : stream.scene;
  const status = String((useSampleData ? 'LIVE' : ((match as any)?.status || stream.resolvedStatus)) || '').toUpperCase();
  const completed = status === 'COMPLETED' || status === 'FINISHED';
  const rawServerScene = (baseScene?.scene || 'PLAY') as string;
  const serverScene = completed && rawServerScene === 'PLAY' ? 'FINAL' : rawServerScene;
  const activeScene = forcedScene || serverScene;
  const activeTemplate = forcedTemplate || baseScene?.template || (completed && rawServerScene === 'PLAY' ? 'FINAL_MATCH_RESULT' : null);
  const renderSceneState = { ...(baseScene || {}), scene: activeScene, template: activeTemplate, payload: (baseScene?.payload || {}) };

  const dedicated = !!forcedTemplate || !!sceneParam || previewMode;
  const hasGraphic = !!activeTemplate || (activeScene !== 'PLAY' && SCENES_WITH_GRAPHIC.has(activeScene));
  const show = hasGraphic && (dedicated || useSampleData || SCENES_WITH_GRAPHIC.has(serverScene)) && activeScene !== 'PLAY';

  const debugChip = (
    <ConnectionGuard
      debug={debug}
      live={live}
      connected={connected}
      revision={revision}
      matchId={useSampleData ? 'preview' : stream.matchId}
      status={status || null}
      court={(match as any)?.court || null}
      scene={activeScene}
      scorebugVisible={renderSceneState?.scorebug?.visible ?? null}
      lastError={lastError || stream.lastError}
      lastSnapshotAt={stream.lastSnapshotAt}
    />
  );

  if (!match) {
    return <ScaledStage hideCursor bg={bg}>{debugChip}</ScaledStage>;
  }

  const C = (activeTemplate && (TEMPLATE_COMPONENTS as any)[activeTemplate]) || (SCENE_COMPONENTS as any)[activeScene] || (TEMPLATE_COMPONENTS as any)[activeScene] || null;
  const key = `${activeTemplate || activeScene}:${renderSceneState?.version ?? 0}`;

  return (
    <ScaledStage match={match} hideCursor bg={bg}>
      <OutputErrorBoundary onError={setLastError} resetKey={`${revision}:${(match as any)?.id || ''}:${renderSceneState?.version ?? 0}`}>
      <div style={{ width: 1920, height: 1080, position: 'relative', background: 'transparent' }}>
        <AnimatePresence mode="wait" initial={false}>
          {show && C ? (
            <motion.div
              key={key}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.01 }}
              transition={GRAPHIC_TRANSITION}
              style={{ position: 'absolute', inset: 0, willChange: 'transform, opacity' }}
            >
              <C match={match} scene={renderSceneState} analytics={null} payload={renderSceneState?.payload || {}} template={activeTemplate} />
            </motion.div>
          ) : (
            <motion.div key="clear" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ position: 'absolute', inset: 0 }} />
          )}
        </AnimatePresence>
      </div>
      </OutputErrorBoundary>
      {useSampleData && <div style={{position:'fixed',top:12,right:12,zIndex:9999,background:'#b45309',color:'#fff',fontWeight:800,padding:'6px 10px',borderRadius:8,fontSize:12,letterSpacing:'0.08em'}}>SAMPLE DATA</div>}
      {debugChip}
    </ScaledStage>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScaledStage, ConnectionGuard } from '../components/broadcast/index.js';
import { SCENE_COMPONENTS, TEMPLATE_COMPONENTS } from '../features/broadcast/templates.js';
import { overlayBgStyle, type OverlayBg } from '../utils/overlay.js';

function baseMatch() {
  return {
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
  } as any;
}

function applyScenario(match: any, scenario: string) {
  const m = JSON.parse(JSON.stringify(match));
  m.flags = { setPoint: null, matchPoint: null, setWon: null, matchWon: null, courtSwitchDue: false, isDecidingSet: false, technicalTimeoutDue: false };
  m.lastEvent = null; m.status = 'LIVE'; m.winner = null;
  if (scenario === 'setbreak') { m.current_set = 4; m.teams.A.sets = 2; m.teams.B.sets = 1; m.setHistory = [{number:1,scoreA:25,scoreB:20,winner:'A'},{number:2,scoreA:23,scoreB:25,winner:'B'},{number:3,scoreA:25,scoreB:22,winner:'A'}]; m.set_scores={A:[25,23,25,0,0],B:[20,25,22,0,0]}; }
  else if (scenario === 'timeout') { m.teams.B.timeoutsUsed = 1; m.lastEvent = { id:'e1', seq: 40, team: 'B', action: 'TIMEOUT_CALLED', time: new Date().toISOString(), payload: { type: 'TIMEOUT_CALLED', teamSide: 'AWAY' } }; }
  else if (scenario === 'final') { m.status='FINISHED'; m.winner='A'; m.teams.A.sets=3; m.teams.B.sets=1; m.setHistory=[{number:1,scoreA:25,scoreB:20,winner:'A'},{number:2,scoreA:23,scoreB:25,winner:'B'},{number:3,scoreA:25,scoreB:22,winner:'A'},{number:4,scoreA:25,scoreB:18,winner:'A'}]; m.set_scores={A:[25,23,25,25,0],B:[20,25,22,18,0]}; }
  else if (scenario === 'momentum') { m.current_set=4; m.teams.A.sets=2; m.teams.B.sets=1; m.setHistory=[{number:1,scoreA:25,scoreB:20,winner:'A'},{number:2,scoreA:23,scoreB:25,winner:'B'},{number:3,scoreA:25,scoreB:22,winner:'A'},{number:4,scoreA:18,scoreB:16,winner:null}]; m.set_scores={A:[25,23,25,18,0],B:[20,25,22,16,0]}; }
  else if (scenario === 'empty' || scenario === 'missing') {
    m.tournament = null; m.division = null; m.court = null; m.match_no = null;
    m.teams.A.logoUrl = null; m.teams.B.logoUrl = null; m.teams.A.shortName = 'A'; m.teams.B.shortName = 'B'; m.teams.A.name = 'TEAM A'; m.teams.B.name = 'TEAM B';
    m.teams.A.lineup = []; m.teams.B.lineup = []; m.teams.A.bench = []; m.teams.B.bench = [];
    m.teams.A.stats = { kill:0,error:0,ace:0,block:0,dig:0,assist:0,side_out:0 }; m.teams.B.stats = { kill:0,error:0,ace:0,block:0,dig:0,assist:0,side_out:0 };
    m.teams.A.score = 0; m.teams.B.score = 0; m.teams.A.sets = 0; m.teams.B.sets = 0;
    m.setHistory = []; m.set_scores = { A:[0,0,0,0,0], B:[0,0,0,0,0] };
  }
  return m;
}

const sceneOptions = [
  { value: 'SCOREBUG', label: 'Scorebug' },
  { value: 'SET_BREAK', label: 'Set Break' },
  { value: 'TIMEOUT', label: 'Timeout' },
  { value: 'MATCH_STATS', label: 'Match Stats' },
  { value: 'LINEUPS', label: 'Lineups' },
  { value: 'HEAD_TO_HEAD', label: 'Head to Head' },
  { value: 'PLAYER_SPOTLIGHT', label: 'Player Spotlight' },
  { value: 'MATCH_MOMENTUM', label: 'Match Momentum' },
  { value: 'FINAL', label: 'Final' },
  { value: 'BREAK_SLATE', label: 'Break Slate' },
];

const scenarioOptions = ['normal','setbreak','timeout','momentum','final','empty'];

export const OverlayPreviewPage: React.FC = () => {
  const [search] = useSearchParams();
  const initialScene = (search.get('scene') || 'SET_BREAK').toUpperCase();
  const [scene, setScene] = useState(sceneOptions.some(s=>s.value===initialScene) ? initialScene : 'SET_BREAK');
  const [seed, setSeed] = useState(1);
  const scenario = (search.get('scenario') || 'normal').toLowerCase();
  const [dataScenario, setDataScenario] = useState(scenarioOptions.includes(scenario) ? scenario : 'normal');
  const [previewBg, setPreviewBg] = useState<OverlayBg>('checker');
  const [sampleVideo, setSampleVideo] = useState(true);

  const match = useMemo(() => applyScenario(baseMatch(), dataScenario), [dataScenario, seed]);
  useEffect(() => { const s = (search.get('scene') || '').toUpperCase(); if (sceneOptions.some(x=>x.value===s)) setScene(s); }, [search]);

  const outputScene: any = useMemo(() => ({
    matchId: 'preview', scene, scorebug: { visible: scene === 'SCOREBUG', variant: 'classic', position: 'top-left', scale: 1, showSetHistory: false, showPreMatch: true }, lock: false,
    timerEndsAt: scene === 'TIMEOUT' ? new Date(Date.now() + 28000).toISOString() : scene === 'SET_BREAK' || scene === 'BREAK_SLATE' ? new Date(Date.now() + 45000).toISOString() : null,
    autoTriggers: {}, version: 1, revision: 101, payload: {},
  }), [scene]);

  const renderContent = () => {
    if (scene === 'SCOREBUG') {
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#d6deea' }}>
            <div style={{ fontSize: 30, marginBottom: 12 }}>Scorebug renders on its dedicated route.</div>
            <a href={`/broadcast/preview/scorebug?preview=1&scenario=normal`} target="_blank" rel="noreferrer" style={{ color:'#93c5fd', fontSize: 28 }}>Open /broadcast/preview/scorebug?scenario=normal</a>
          </div>
        </div>
      );
    }
    const C = (SCENE_COMPONENTS as any)[scene] || (TEMPLATE_COMPONENTS as any)[scene];
    return C ? <C match={match} scene={outputScene} analytics={null} payload={{}} /> : null;
  };

  const frameBg = sampleVideo
    ? { background: 'radial-gradient(circle at 20% 20%, #334155, #0f172a 55%, #020617)' }
    : overlayBgStyle(previewBg);

  return (
    <div style={{ minHeight: '100vh', background: '#111827', color: '#e5e7eb', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 18 }}>Overlay Preview</strong>
        <select value={scene} onChange={e=>setScene(e.target.value)} style={{ background:'#0b1220', color:'#fff', border:'1px solid #334155', borderRadius:8, padding:'8px 10px' }}>
          {sceneOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={dataScenario} onChange={e=>setDataScenario(e.target.value)} style={{ background:'#0b1220', color:'#fff', border:'1px solid #334155', borderRadius:8, padding:'8px 10px' }}>
          {scenarioOptions.map(s => <option key={s} value={s}>{s}{s==='empty' ? ' (missing data)' : ''}</option>)}
        </select>
        <label style={{ fontSize: 13, color: '#cbd5e1' }}>Preview background
          <select value={previewBg} onChange={e=>setPreviewBg(e.target.value as OverlayBg)} disabled={sampleVideo} style={{ marginLeft: 8, background:'#0b1220', color:'#fff', border:'1px solid #334155', borderRadius:8, padding:'6px 8px' }}>
            <option value="checker">checker</option>
            <option value="dark">dark</option>
            <option value="video">video-like</option>
            <option value="transparent">none (transparent)</option>
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={sampleVideo} onChange={e=>setSampleVideo(e.target.checked)} /> Sample video background (local preview)
        </label>
        <button onClick={()=>setSeed(s=>s+1)} style={{ background:'#1d4ed8', color:'#fff', border:0, borderRadius:8, padding:'8px 12px', cursor:'pointer' }}>Regenerate</button>
        <span style={{ color:'#94a3b8', fontSize: 13 }}>Canvas 1920x1080 scaled to frame (preview helpers only; on-air links must be clean/transparent)</span>
      </div>
      <div style={{ width: '100%', maxWidth: 1280, aspectRatio: '16 / 9', position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid #334155', ...frameBg }}>
        {sampleVideo && <div style={{ position:'absolute', inset:0, opacity:0.22, backgroundImage:'linear-gradient(45deg,rgba(255,255,255,0.06) 25%,transparent 25%,transparent 50%,rgba(255,255,255,0.06) 50%,rgba(255,255,255,0.06) 75%,transparent 75%,transparent)', backgroundSize:'48px 48px' }} />}
        {sampleVideo && <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(15,23,42,0.15), rgba(2,6,23,0.35))' }} />}
        <div style={{ position:'absolute', inset:0 }}>
          <ScaledStage match={match} hideCursor={false}>
            <div style={{ width: 1920, height: 1080, position: 'relative' }}>
              {renderContent()}
              <ConnectionGuard debug live connected revision={match.revision} />
            </div>
          </ScaledStage>
        </div>
        <div style={{ position:'absolute', top:16, right:16, zIndex: 30, background:'#b45309', color:'#fff', fontWeight:800, padding:'6px 10px', borderRadius:8, fontSize:12, letterSpacing:'0.08em' }}>SAMPLE DATA</div>
        {sampleVideo && <div style={{ position:'absolute', left:16, bottom:16, fontSize:12, color:'#cbd5e1', background:'rgba(0,0,0,0.35)', padding:'4px 8px', borderRadius:6 }}>SAMPLE VIDEO FEED (preview)</div>}
      </div>
    </div>
  );
};

export default OverlayPreviewPage;

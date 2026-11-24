import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ScaledStage, ConnectionGuard, OutputErrorBoundary } from '../components/broadcast/index.js';
import { ScorebugOverlay } from '../components/broadcast/ScorebugOverlay.js';
import { useOutputStream } from '../hooks/useOutputStream.js';
import { parseOverlayBg } from '../utils/overlay.js';

function previewMatch(scenario: string) {
  const base: any = {
    id: 'preview', status: 'LIVE', winner: null, current_set: 2, max_sets: 5, server: 'A',
    tournament: 'Greater Accra Volleyball League', division: "Men's Division", court: 'Court 1', match_no: '24',
    match_date: '2026-11-13', referee1: '', referee2: '', started_at: new Date().toISOString(), ended_at: null, server_time: new Date().toISOString(),
    teams: {
      A: { name: 'ELWAK WINGS', shortName: 'ELW', logoUrl: '/uploads/teams/elwak-wings.svg', primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#fff', score: 18, sets: 1, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: 1, stats: { kill: 10, error: 4, ace: 2, block: 3, dig: 12, assist: 9, side_out: 50 } },
      B: { name: 'GHANA NAVY', shortName: 'NAVY', logoUrl: '/uploads/teams/ghana-navy.svg', primaryColor: '#1d4ed8', secondaryColor: '#0f172a', textColor: '#fff', score: 16, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: null, stats: { kill: 9, error: 5, ace: 1, block: 2, dig: 11, assist: 8, side_out: 45 } },
    },
    set_scores: { A: [25,18,0,0,0], B: [20,16,0,0,0] },
    setHistory: [{ number: 1, scoreA: 25, scoreB: 20, winner: 'A' }, { number: 2, scoreA: 18, scoreB: 16, winner: null }],
    events: [], flags: { setPoint: null, matchPoint: null, setWon: null, matchWon: null, courtSwitchDue: false, isDecidingSet: false, technicalTimeoutDue: false },
    revision: 10, lastEvent: null,
    rules: { bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, rallyScoring: true, timeoutsPerSet: 2, substitutionsPerSet: 6 },
  };
  const m = JSON.parse(JSON.stringify(base));
  switch (scenario) {
    case 'setpoint': m.current_set=3; m.teams.A.sets=1; m.teams.B.sets=1; m.teams.A.score=24; m.teams.B.score=22; m.flags.setPoint='A'; m.setHistory=[{number:1,scoreA:25,scoreB:20,winner:'A'},{number:2,scoreA:22,scoreB:25,winner:'B'},{number:3,scoreA:24,scoreB:22,winner:null}]; break;
    case 'matchpoint': m.current_set=4; m.teams.A.sets=2; m.teams.B.sets=1; m.teams.A.score=24; m.teams.B.score=23; m.flags.setPoint='A'; m.flags.matchPoint='A'; m.setHistory=[{number:1,scoreA:25,scoreB:20,winner:'A'},{number:2,scoreA:22,scoreB:25,winner:'B'},{number:3,scoreA:25,scoreB:19,winner:'A'},{number:4,scoreA:24,scoreB:23,winner:null}]; break;
    case 'timeout': m.teams.B.timeoutsUsed=1; m.teams.B.timeouts=1; m.server='B'; m.lastEvent={id:'e-to',seq:30,team:'B',action:'TIMEOUT_CALLED',time:new Date().toISOString(),payload:{type:'TIMEOUT_CALLED',teamSide:'AWAY'}}; break;
    case 'setwon': m.teams.A.score=25; m.teams.B.score=23; m.flags.setWon='A'; m.setHistory=[{number:1,scoreA:25,scoreB:20,winner:'A'},{number:2,scoreA:25,scoreB:23,winner:'A'}]; break;
    case 'longnames': m.teams.A.name='GREATER ACCRA METROPOLITAN VOLLEYBALL CLUB'; m.teams.A.shortName='GAMV'; m.teams.B.name='NORTHERN REGIONAL DEFENDERS UNITED'; m.teams.B.shortName='NRDU'; m.teams.A.score=23; m.teams.B.score=23; break;
    case 'similarcolors': m.teams.A.primaryColor='#1e40af'; m.teams.A.secondaryColor='#60a5fa'; m.teams.B.primaryColor='#1d4ed8'; m.teams.B.secondaryColor='#93c5fd'; break;
    case 'missinglogo': m.teams.A.logoUrl=null; m.teams.B.logoUrl=null; break;
    case 'highscores': m.current_set=1; m.teams.A.sets=0; m.teams.B.sets=0; m.teams.A.score=32; m.teams.B.score=30; m.flags.setPoint='A'; m.setHistory=[{number:1,scoreA:32,scoreB:30,winner:null}]; break;
    default: break;
  }
  return m;
}

type TeamKey = 'A' | 'B';

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

export const ScorebugPage: React.FC = () => {
  const { matchId } = useParams();
  const [search] = useSearchParams();
  const debug = search.get('debug') === '1';
  const bg = parseOverlayBg(search.get('bg'));
  const scenario = (search.get('scenario') || '').toLowerCase();
  const explicitDemo = search.get('demo') === '1' || matchId === 'preview' || !!scenario;
  const useSampleData = explicitDemo; // sample data only behind explicit demo flag
  const stream = useOutputStream({ matchId: useSampleData ? undefined : matchId, resolveCurrent: !useSampleData && !matchId, clientType: 'scorebug', debug });
  const [lastError, setLastError] = useState<string | null>(null);
  const preview = useMemo(() => useSampleData ? { match: previewMatch(scenario || 'normal'), scene: { scorebug: { visible: true, variant: 'classic', position: 'top-left', scale: 1, showSetHistory: true, showPreMatch: true, showLogos: true, showTournament: true, tournamentLabel: null }, scene: 'PLAY', template: null, payload: {}, startedAt: null, lock: false, timerEndsAt: null, autoTriggers: {}, version: 1, revision: 10 }, live: true, connected: true, revision: 10 } : null, [useSampleData, scenario]);
  const match = useSampleData ? (preview as any).match : stream.match;
  const scene = useSampleData ? (preview as any).scene : stream.scene;
  const live = useSampleData ? true : stream.live;
  const connected = useSampleData ? true : stream.connected;
  const revision = useSampleData ? (preview as any).revision : stream.revision;

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

  // Keep last good state: hook already retains match; but also guard against rendering null data on-air
  const lastGood = useRef<any>(null);
  useEffect(() => { if (match) lastGood.current = match; }, [match]);
  const m = match || lastGood.current;

  // State rules: no match → transparent; SCHEDULED/READY → scorebug only when
  // the operator enabled "show pre-match"; LIVE/PAUSED/BETWEEN_SETS → show.
  const status = String((useSampleData ? 'LIVE' : (m?.status || stream.resolvedStatus)) || '').toUpperCase();
  const isPreMatch = status === 'SCHEDULED' || status === 'READY';
  const isTerminal = status === 'COMPLETED' || status === 'FINISHED' || status === 'CANCELLED';
  const showPreMatch = !!scene?.scorebug?.showPreMatch;
  const scorebugVisible = settings.visible && !isTerminal && (!isPreMatch || showPreMatch);
  const debugChip = (
    <ConnectionGuard
      debug={debug}
      live={live}
      connected={connected}
      revision={revision}
      matchId={useSampleData ? 'preview' : stream.matchId}
      status={status || null}
      court={m?.court || null}
      scene={scene?.scene || null}
      scorebugVisible={scorebugVisible}
      lastError={lastError || stream.lastError}
      lastSnapshotAt={stream.lastSnapshotAt}
    />
  );

  // score change highlight tracking
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

  // banner logic (server flags + last event)
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

    // timeout/technical timeout from recent event or scene
    const le = m.lastEvent;
    const lastEventType = String(le?.action || le?.payload?.type || '').toUpperCase();
    const lastPayload = le?.payload || {};
    if (!next && (lastEventType.includes('TIMEOUT_CALLED') || lastEventType.includes('TIMEOUT'))) {
      const side = (le?.team || (lastPayload.teamSide === 'HOME' ? 'A' : lastPayload.teamSide === 'AWAY' ? 'B' : null)) as TeamKey | null;
      const isTech = /TECHNICAL/i.test(JSON.stringify(lastPayload)) || scene?.scene === 'TIMEOUT' && /TECHNICAL/i.test(String(scene?.scene));
      if (isTech) { key = `tt-${le?.id || le?.seq || revision}`; next = { text: 'TECHNICAL TIMEOUT', color: '#334155', textColor: '#fff' }; }
      else if (side) { key = `to-${side}-${le?.id || le?.seq || revision}`; next = { text: `TIMEOUT - ${teamName(side)}`, color: 'var(--team-' + side.toLowerCase() + ')', textColor: 'var(--team-' + side.toLowerCase() + '-text)' }; }
    }

    // avoid banner flicker: show when key changes, auto-retract for transient banners
    if (next && key && key !== bannerKey.current) {
      bannerKey.current = key;
      setBanner(next);
      const transient = /SET WON|TIMEOUT|COURT SWITCH/.test(next.text);
      if (transient) {
        const t = window.setTimeout(() => setBanner(curr => (curr?.text === next!.text ? null : curr)), 5000);
        return () => window.clearTimeout(t);
      }
    } else if (!next) {
      // clear point banners when flags gone, but keep nothing sticky
      if (/MATCH POINT|SET POINT/.test(banner?.text || '')) setBanner(null);
      bannerKey.current = key;
    }
  }, [m?.flags?.setPoint, m?.flags?.matchPoint, m?.flags?.setWon, m?.flags?.courtSwitchDue, m?.lastEvent?.id, m?.lastEvent?.seq, m?.teams?.A?.score, m?.teams?.B?.score, scene?.scene, revision]);

  return (
    <ScaledStage match={m} hideCursor bg={bg}>
      <OutputErrorBoundary onError={setLastError} resetKey={`${revision}:${m?.id || ''}:${scene?.version ?? 0}`}>
        <div style={{ width: 1920, height: 1080, position: 'relative', fontFamily: '"Barlow Condensed", Inter, sans-serif', background: 'transparent' }}>
          <ScorebugOverlay
            match={m}
            settings={settings}
            status={status}
            scoreFlash={scoreFlash}
            banner={banner}
            forceShow={useSampleData}
          />
        </div>
      </OutputErrorBoundary>
      {useSampleData && <div style={{position:'fixed',top:12,right:12,zIndex:9999,background:'#b45309',color:'#fff',fontWeight:800,padding:'6px 10px',borderRadius:8,fontSize:12,letterSpacing:'0.08em'}}>SAMPLE DATA</div>}
      {debugChip}
    </ScaledStage>
  );
};

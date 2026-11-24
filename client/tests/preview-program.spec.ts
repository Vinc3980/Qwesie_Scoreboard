import { test, expect } from '@playwright/test';

test.describe('preview / take / clear console workflow', () => {
  test('operator can preview, take and clear without leaving live control', async ({ page }) => {
    const matchId = 'match-ptc-1';
    let programScene: any = {
      matchId,
      scene: 'PLAY',
      template: null,
      payload: {},
      startedAt: null,
      scorebug: { visible: true, variant: 'classic', position: 'top-left', scale: 1, showSetHistory: false, showPreMatch: true, showLogos: true, showTournament: true, tournamentLabel: null },
      lock: false,
      timerEndsAt: null,
      autoTriggers: {},
      version: 1,
      revision: 1,
    };
    let previewState: any = { matchId, cue: null, version: 0, updatedAt: null };
    let previewPosts = 0;
    let takePosts = 0;
    let clearPosts = 0;

    const matchState = {
      id: matchId,
      status: 'LIVE',
      winner: null,
      current_set: 1,
      max_sets: 5,
      server: 'A',
      tournament: 'Test Tournament',
      division: 'Open',
      court: 'Court 1',
      match_no: 'PTC',
      match_date: '2026-11-19',
      referee1: '',
      referee2: '',
      started_at: new Date().toISOString(),
      ended_at: null,
      server_time: new Date().toISOString(),
      teams: {
        A: { name: 'ALPHA VC', shortName: 'ALP', logoUrl: null, primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#fff', score: 12, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [
          { id: 'a1', jerseyNumber: 1, name: 'Alpha One', position: 'OH' },
          { id: 'a2', jerseyNumber: 2, name: 'Alpha Two', position: 'MB' },
          { id: 'a3', jerseyNumber: 3, name: 'Alpha Three', position: 'OPP' },
          { id: 'a4', jerseyNumber: 4, name: 'Alpha Four', position: 'S' },
          { id: 'a5', jerseyNumber: 5, name: 'Alpha Five', position: 'OH' },
          { id: 'a6', jerseyNumber: 6, name: 'Alpha Six', position: 'L', isLibero: true },
        ], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: 1, stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
        B: { name: 'BETA VC', shortName: 'BET', logoUrl: null, primaryColor: '#1d4ed8', secondaryColor: '#0f172a', textColor: '#fff', score: 10, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [
          { id: 'b1', jerseyNumber: 1, name: 'Beta One', position: 'OH' },
          { id: 'b2', jerseyNumber: 2, name: 'Beta Two', position: 'MB' },
          { id: 'b3', jerseyNumber: 3, name: 'Beta Three', position: 'OPP' },
          { id: 'b4', jerseyNumber: 4, name: 'Beta Four', position: 'S' },
          { id: 'b5', jerseyNumber: 5, name: 'Beta Five', position: 'OH' },
          { id: 'b6', jerseyNumber: 6, name: 'Beta Six', position: 'L', isLibero: true },
        ], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: null, stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
      },
      set_scores: { A: [12, 0, 0, 0, 0], B: [10, 0, 0, 0, 0] },
      setHistory: [
        { number: 1, scoreA: 12, scoreB: 10, winner: null },
        { number: 2, scoreA: 0, scoreB: 0, winner: null },
        { number: 3, scoreA: 0, scoreB: 0, winner: null },
        { number: 4, scoreA: 0, scoreB: 0, winner: null },
        { number: 5, scoreA: 0, scoreB: 0, winner: null },
      ],
      events: [],
      flags: { setPoint: null, matchPoint: null, setWon: null, matchWon: null, courtSwitchDue: false, isDecidingSet: false, technicalTimeoutDue: false },
      revision: 1,
      lastEvent: null,
      rules: { bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, rallyScoring: true, timeoutsPerSet: 2, substitutionsPerSet: 6 },
      rotationLocked: false,
    };

    const json = (route: any, data: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }) });

    await page.route('**/api/v1/auth/bootstrap-status', route => json(route, { needsBootstrap: false }));
    await page.route('**/api/v1/auth/me', route => json(route, { user: { id: 'u1', username: 'scorer', displayName: 'Scorer', role: 'SCORER' } }));

    await page.route(`**/api/v1/matches/${matchId}`, route => json(route, matchState));
    await page.route(`**/api/v1/broadcast/${matchId}/scene`, route => json(route, programScene));
    await page.route(`**/api/v1/broadcast/${matchId}/graphic`, route => json(route, { activeTemplate: 'SCOREBUG', visible: false, breakState: { active: false } }));
    await page.route(`**/api/v1/broadcast/${matchId}/preview`, async (route) => {
      if (route.request().method() === 'POST') {
        previewPosts++;
        const body = route.request().postDataJSON() as any;
        const cue = body?.cue || body || {};
        previewState = { matchId, cue: { template: cue.template ?? null, payload: cue.payload || {}, duration: cue.duration ?? null, autoReturn: cue.autoReturn ?? !!cue.duration }, version: (previewState.version || 0) + 1, updatedAt: new Date().toISOString() };
        return json(route, previewState);
      }
      return json(route, previewState);
    });
    await page.route(`**/api/v1/broadcast/${matchId}/take`, async (route) => {
      takePosts++;
      const cue = previewState.cue;
      if (cue && cue.template) {
        programScene = { ...programScene, scene: cue.template === 'MATCH_STATISTICS' ? 'MATCH_STATS' : cue.template === 'TEAM_COMPARISON' ? 'HEAD_TO_HEAD' : 'MATCH_STATS', template: cue.template, payload: cue.payload || {}, version: (programScene.version || 1) + 1 };
      } else {
        programScene = { ...programScene, scene: 'PLAY', template: null, payload: {}, version: (programScene.version || 1) + 1 };
      }
      return json(route, { scene: programScene });
    });
    await page.route(`**/api/v1/broadcast/${matchId}/clear`, async (route) => {
      clearPosts++;
      programScene = { ...programScene, scene: 'PLAY', template: null, payload: {}, version: (programScene.version || 1) + 1 };
      return json(route, { scene: programScene });
    });
    await page.route('**/api/v1/system/info', route => json(route, { connectedClients: { total: 0, byType: { scorebug: 0, graphics: 0, console: 0, other: 0 } }, lanIpv4: ['192.168.1.10'], port: 3000 }));
    await page.route('**/api/v1/matches/active', route => json(route, { matchId, status: 'LIVE' }));
    await page.route('**/socket.io/**', route => route.abort());

    await page.goto(`/live/${matchId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Preview', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Program', { exact: true }).first()).toBeVisible();

    // Select a graphic -> loads Preview (no take yet)
    await page.getByRole('button', { name: /STATS \(2\)/ }).click();
    await expect.poll(() => previewPosts).toBeGreaterThan(0);
    await expect(page.getByText(/Preview:\s*MATCH STATISTICS/i)).toBeVisible();

    // Take -> program goes ON AIR
    await page.getByRole('button', { name: /^TAKE/ }).click();
    await expect.poll(() => takePosts).toBe(1);
    await expect(page.getByText(/ON AIR:\s*MATCH_STATISTICS/i)).toBeVisible();

    // Clear -> restores scorebug/clear
    await page.getByRole('button', { name: /^CLEAR/ }).click();
    await expect.poll(() => clearPosts).toBe(1);
    await expect(page.getByText(/ON AIR:\s*Scorebug \/ Clear/i)).toBeVisible();
  });
});


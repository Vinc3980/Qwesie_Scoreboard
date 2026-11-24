import { test, expect } from '@playwright/test';

test.describe('OBS preset output behavior', () => {
  test('Direct mode sends Match Intro to program immediately; Preview-then-Take waits for Take; court on-air change switches output without reload; stale PAUSED mismatch shows fix', async ({ page, context }) => {
    const matchA = 'm-a';
    const matchB = 'm-b';
    let loggedIn = false;
    let onAirMatchId: string | null = matchA;
    let matchBStatus = 'SCHEDULED';
    let programScene: any = { matchId: matchA, scene: 'PLAY', template: null, payload: {}, version: 1, scorebug: { visible: true } };
    let previewCue: any = { cue: null, version: 0 };
    const takeCalls: any[] = [];
    const previewCalls: any[] = [];

    const makeMatch = (id: string) => {
      const isA = id === matchA;
      const status = isA ? 'LIVE' : matchBStatus;
      return {
        id,
        status,
        winner: null,
        current_set: 1,
        max_sets: 5,
        server: 'A',
        tournament: 'Test Cup',
        division: 'Open',
        court: '1',
        match_no: isA ? '24' : '25',
        match_date: '2026-11-22',
        scheduledAt: '2026-11-22T10:00:00.000Z',
        teams: {
          A: { id: 'ta', name: isA ? 'ALPHA' : 'NEW HOME', shortName: isA ? 'ALP' : 'NH', logoUrl: null, primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#fff', score: isA ? 5 : 0, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: 1, stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
          B: { id: 'tb', name: isA ? 'BETA' : 'NEW AWAY', shortName: isA ? 'BET' : 'NA', logoUrl: null, primaryColor: '#1d4ed8', secondaryColor: '#0f172a', textColor: '#fff', score: isA ? 3 : 0, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: null, stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
        },
        set_scores: { A: [isA?5:0,0,0,0,0], B: [isA?3:0,0,0,0,0] },
        setHistory: [{ number: 1, scoreA: isA?5:0, scoreB: isA?3:0, winner: null },{number:2,scoreA:0,scoreB:0,winner:null},{number:3,scoreA:0,scoreB:0,winner:null},{number:4,scoreA:0,scoreB:0,winner:null},{number:5,scoreA:0,scoreB:0,winner:null}],
        events: [],
        flags: { setPoint: null, matchPoint: null, setWon: null, matchWon: null, courtSwitchDue: false, isDecidingSet: false, technicalTimeoutDue: false },
        revision: 1,
        lastEvent: null,
        rules: { bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, rallyScoring: true, timeoutsPerSet: 2, substitutionsPerSet: 6 },
      };
    };

    const json = (route: any, data: any, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(status >= 400
        ? { success: false, error: data?.error || { message: data?.message || 'Error' }, timestamp: new Date().toISOString() }
        : { success: true, data, timestamp: new Date().toISOString() }),
    });

    await page.route('**/api/v1/auth/bootstrap-status', route => json(route, { needsBootstrap: false, setupTokenRequired: false }));
    await page.route('**/api/v1/auth/smtp-status', route => json(route, { enabled: false }));
    await page.route('**/api/v1/auth/me', async (route) => {
      if (loggedIn) return json(route, { user: { id: 'u1', username: 'scorer', displayName: 'Scorer', role: 'ADMIN', mustChangePassword: false } });
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Not authenticated', code: 'AUTH_REQUIRED' }, timestamp: new Date().toISOString() }) });
    });
    await page.route('**/api/v1/auth/login', async (route) => { loggedIn = true; return json(route, { user: { id: 'u1', username: 'scorer', displayName: 'Scorer', role: 'ADMIN', mustChangePassword: false } }); });
    await page.route('**/api/v1/system/info', route => json(route, { connectedClients: { total: 1, byType: { scorebug: 1, graphics: 0, console: 1, other: 0 } }, lanIpv4: ['127.0.0.1'], port: 3000, isDevUi: true }));

    await page.route('**/api/v1/system/courts/*/active', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = req.postDataJSON() as any;
        onAirMatchId = body?.matchId || null;
        return json(route, { court: '1', courtKey: '1', matchId: onAirMatchId });
      }
      const m = onAirMatchId ? makeMatch(onAirMatchId) : null;
      return json(route, { court: '1', courtKey: '1', matchId: onAirMatchId, status: m?.status || null, source: onAirMatchId ? 'on_air' : 'none', onAirMatchId, match: m ? { id: m.id, status: m.status, matchNumber: m.match_no, homeTeamName: m.teams.A.name, awayTeamName: m.teams.B.name } : null });
    });

    await page.route('**/api/v1/matches', async (route) => { if (route.request().method() === 'GET') return json(route, [makeMatch(matchA), makeMatch(matchB)]); return route.fallback(); });
    await page.route(`**/api/v1/matches/${matchA}`, route => json(route, makeMatch(matchA)));
    await page.route(`**/api/v1/matches/${matchB}`, route => json(route, makeMatch(matchB)));
    await page.route('**/api/v1/matches/active', route => json(route, onAirMatchId ? { matchId: onAirMatchId, status: makeMatch(onAirMatchId).status } : null));
    await page.route(`**/api/v1/matches/${matchA}/readiness`, route => json(route, { ready: true, canGoLive: true, checklist: [] }));
    await page.route(`**/api/v1/matches/${matchB}/readiness`, route => json(route, { ready: true, canGoLive: true, checklist: [] }));

    await page.route(`**/api/v1/broadcast/templates`, route => json(route, [{ id: 'MATCH_INTRO', name: 'Match Intro' }, { id: 'TEAM_COMPARISON', name: 'Team Comparison' }]));
    await page.route(`**/api/v1/broadcast/${matchA}/scene`, async (route) => { if (route.request().method() === 'GET') return json(route, programScene); return route.fallback(); });
    await page.route(`**/api/v1/broadcast/${matchA}/graphic`, route => json(route, { activeTemplate: programScene.template || 'SCOREBUG', visible: !!programScene.template }));
    await page.route(`**/api/v1/broadcast/${matchA}/preview`, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = req.postDataJSON() as any;
        const cue = body?.cue ?? body;
        previewCue = { cue, version: (previewCue.version || 0) + 1 };
        previewCalls.push(cue);
        return json(route, previewCue);
      }
      return json(route, previewCue);
    });
    await page.route(`**/api/v1/broadcast/${matchA}/take`, async (route) => {
      const body = route.request().postDataJSON?.() as any;
      takeCalls.push(body || {});
      const cue = previewCue.cue || {};
      programScene = { ...programScene, scene: cue.template ? 'BREAK_SLATE' : 'PLAY', template: cue.template || null, payload: cue.payload || {}, version: (programScene.version || 0) + 1 };
      return json(route, { scene: programScene });
    });
    await page.route(`**/api/v1/broadcast/${matchA}/clear`, async (route) => {
      takeCalls.push({ clear: true });
      programScene = { ...programScene, scene: 'PLAY', template: null, payload: {}, version: (programScene.version || 0) + 1 };
      return json(route, { scene: programScene });
    });

    // Output page routes for court output
    await page.route(`**/api/v1/broadcast/${matchB}/scene`, route => json(route, { matchId: matchB, scene: 'PLAY', template: null, payload: {}, version: 1, scorebug: { visible: true } }));
    await page.route(`**/api/v1/broadcast/${matchB}/graphic`, route => json(route, { activeTemplate: 'SCOREBUG', visible: false }));

    // Abort socket.io for determinism; output will use HTTP fallback
    await page.route('**/socket.io/**', route => route.abort());

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Username').fill('scorer');
    await page.locator('#password').fill('Secret123!');
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/overview/, { timeout: 15000 });

    // --- Direct mode: selecting Match Intro goes to program immediately ---
    await page.goto(`/live/${matchA}?tab=graphics`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Cue control')).toBeVisible({ timeout: 15000 });
    // Ensure Direct mode (default)
    await expect(page.getByRole('button', { name: 'Direct' })).toBeVisible();
    await page.getByRole('button', { name: 'Direct' }).click();
    await page.getByRole('button', { name: /SLATE \(7\)/i }).click();
    await expect.poll(() => takeCalls.length, { timeout: 3000 }).toBeGreaterThanOrEqual(1);
    expect(previewCalls.length).toBeGreaterThanOrEqual(1);

    // --- Preview-then-Take: nothing reaches output until Take ---
    takeCalls.length = 0;
    previewCalls.length = 0;
    await page.getByRole('button', { name: 'Preview then Take' }).click();
    await page.getByRole('button', { name: /STATS \(2\)/i }).click();
    await expect.poll(() => previewCalls.length, { timeout: 3000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => takeCalls.length, { timeout: 1200 }).toBe(0);
    await expect(page.getByText(/Loaded in Preview\. Press TAKE \(Enter\) to send to OBS/i)).toBeVisible();
    await page.getByRole('button', { name: /TAKE \(Enter\)/i }).first().click();
    await expect.poll(() => takeCalls.length, { timeout: 3000 }).toBeGreaterThanOrEqual(1);

    // --- Stale PAUSED match on same court shows mismatch banner and fix button works ---
    // Simulate court on-air being matchB while console on matchA
    onAirMatchId = matchB;
    matchBStatus = 'PAUSED';
    await page.goto(`/live/${matchA}?tab=graphics`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Console is controlling a different match/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Make this match on-air/i })).toBeVisible();
    await page.getByRole('button', { name: /Make this match on-air/i }).click();
    await expect.poll(() => onAirMatchId, { timeout: 3000 }).toBe(matchA);

    // --- Changing court on-air match switches open output without reload ---
    onAirMatchId = matchA;
    programScene = { matchId: matchA, scene: 'PLAY', template: null, payload: {}, version: 5, scorebug: { visible: true } };
    const out = await context.newPage();
    await out.route('**/api/v1/system/courts/*/active', async (route) => {
      const req = route.request();
      const m = onAirMatchId ? makeMatch(onAirMatchId) : null;
      return json(route, { court: '1', courtKey: '1', matchId: onAirMatchId, status: m?.status || null, source: onAirMatchId ? 'on_air' : 'none', onAirMatchId, match: m ? { id: m.id, status: m.status, matchNumber: m.match_no, homeTeamName: m.teams.A.name, awayTeamName: m.teams.B.name } : null });
    });
    await out.route(`**/api/v1/matches/${matchA}`, route => json(route, makeMatch(matchA)));
    await out.route(`**/api/v1/matches/${matchB}`, route => json(route, makeMatch(matchB)));
    await out.route(`**/api/v1/broadcast/${matchA}/scene`, route => json(route, { ...programScene, matchId: matchA }));
    await out.route(`**/api/v1/broadcast/${matchA}/graphic`, route => json(route, { activeTemplate: 'SCOREBUG', visible: false }));
    await out.route(`**/api/v1/broadcast/${matchB}/scene`, route => json(route, { matchId: matchB, scene: 'PLAY', template: null, payload: {}, version: 1, scorebug: { visible: true } }));
    await out.route(`**/api/v1/broadcast/${matchB}/graphic`, route => json(route, { activeTemplate: 'SCOREBUG', visible: false }));
    await out.route('**/socket.io/**', route => route.abort());
    await out.goto('/out/court/1/all?debug=1', { waitUntil: 'domcontentloaded' });
    await expect(out.locator('body')).toContainText(/ALPHA|ALP/i, { timeout: 15000 });
    onAirMatchId = matchB;
    await expect(out.locator('body')).toContainText(/NEW HOME|NH/i, { timeout: 12000 });
  });
});

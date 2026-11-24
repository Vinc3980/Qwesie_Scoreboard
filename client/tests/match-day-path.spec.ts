import { test, expect } from '@playwright/test';

test.describe('match-day path', () => {
  test('fresh login -> overview checklist -> live match with outputs, score/graphics/output status without changing pages, redirects and back work', async ({ page }) => {
    const matchId = 'm1';

    let loggedIn = false;
    let matchStatus: 'SCHEDULED' | 'LIVE' = 'SCHEDULED';
    let clients = { scorebug: 0, graphics: 0, console: 0, other: 0 };
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
    let scores = { A: 0, B: 0 };

    const baseMatch = () => ({
      id: matchId,
      status: matchStatus,
      winner: null,
      current_set: 1,
      max_sets: 5,
      server: 'A',
      tournament: 'Test Cup',
      division: 'Open',
      court: '1',
      match_no: '1',
      match_date: '2026-11-19',
      referee1: '',
      referee2: '',
      started_at: matchStatus === 'LIVE' ? new Date().toISOString() : null,
      ended_at: null,
      server_time: new Date().toISOString(),
      teams: {
        A: { name: 'ALPHA', shortName: 'ALP', logoUrl: null, primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#fff', score: scores.A, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [
          { id: 'a1', jerseyNumber: 1, name: 'Alpha One', position: 'OH' },
          { id: 'a2', jerseyNumber: 2, name: 'Alpha Two', position: 'MB' },
          { id: 'a3', jerseyNumber: 3, name: 'Alpha Three', position: 'OPP' },
          { id: 'a4', jerseyNumber: 4, name: 'Alpha Four', position: 'S' },
          { id: 'a5', jerseyNumber: 5, name: 'Alpha Five', position: 'OH' },
          { id: 'a6', jerseyNumber: 6, name: 'Alpha Six', position: 'L', isLibero: true },
        ], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: 1, stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
        B: { name: 'BETA', shortName: 'BET', logoUrl: null, primaryColor: '#1d4ed8', secondaryColor: '#0f172a', textColor: '#fff', score: scores.B, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [
          { id: 'b1', jerseyNumber: 1, name: 'Beta One', position: 'OH' },
          { id: 'b2', jerseyNumber: 2, name: 'Beta Two', position: 'MB' },
          { id: 'b3', jerseyNumber: 3, name: 'Beta Three', position: 'OPP' },
          { id: 'b4', jerseyNumber: 4, name: 'Beta Four', position: 'S' },
          { id: 'b5', jerseyNumber: 5, name: 'Beta Five', position: 'OH' },
          { id: 'b6', jerseyNumber: 6, name: 'Beta Six', position: 'L', isLibero: true },
        ], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: null, stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
      },
      set_scores: { A: [scores.A, 0, 0, 0, 0], B: [scores.B, 0, 0, 0, 0] },
      setHistory: [
        { number: 1, scoreA: scores.A, scoreB: scores.B, winner: null },
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
    });

    const json = (route: any, data: any, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(status >= 400
          ? { success: false, error: { message: data?.message || 'Error' }, timestamp: new Date().toISOString() }
          : { success: true, data, timestamp: new Date().toISOString() }),
      });

    await page.route('**/api/v1/auth/bootstrap-status', route => json(route, { needsBootstrap: false, setupTokenRequired: false }));
    await page.route('**/api/v1/auth/smtp-status', route => json(route, { enabled: false }));
    await page.route('**/api/v1/auth/me', async (route) => {
      if (loggedIn) return json(route, { user: { id: 'u1', username: 'scorer', displayName: 'Scorer', role: 'SCORER', mustChangePassword: false } });
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Not authenticated', code: 'AUTH_REQUIRED' }, timestamp: new Date().toISOString() }) });
    });
    await page.route('**/api/v1/auth/login', async (route) => {
      const body = route.request().postDataJSON() as any;
      if (body?.username === 'scorer' && body?.password === 'Secret123!') {
        loggedIn = true;
        return json(route, { user: { id: 'u1', username: 'scorer', displayName: 'Scorer', role: 'SCORER', mustChangePassword: false } });
      }
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Invalid username or password' }, timestamp: new Date().toISOString() }) });
    });

    const readiness = {
      matchId,
      ready: true,
      checklist: [
        { key: 'teams', label: 'Teams', ok: true },
        { key: 'home_roster', label: 'Home roster', ok: true },
        { key: 'away_roster', label: 'Away roster', ok: true },
        { key: 'home_starting_lineup', label: 'Home starting six', ok: true },
        { key: 'away_starting_lineup', label: 'Away starting six', ok: true },
      ],
    };

    await page.route(`**/api/v1/matches/${matchId}/readiness`, route => json(route, readiness));
    await page.route(`**/api/v1/matches/${matchId}/go-live`, async (route) => {
      matchStatus = 'LIVE';
      return json(route, baseMatch());
    });
    await page.route(`**/api/v1/matches/${matchId}/point`, async (route) => {
      const body = route.request().postDataJSON() as any;
      if (body?.team === 'A') scores.A++; else scores.B++;
      return json(route, baseMatch());
    });
    await page.route(`**/api/v1/matches/${matchId}`, async (route) => {
      if (route.request().method() === 'GET') return json(route, baseMatch());
      return route.fallback();
    });
    await page.route('**/api/v1/matches', async (route) => {
      if (route.request().method() === 'GET') return json(route, [baseMatch()]);
      if (route.request().method() === 'POST') return json(route, baseMatch());
      return route.fallback();
    });
    await page.route('**/api/v1/matches/active', route => json(route, matchStatus === 'LIVE' ? { matchId, status: 'LIVE' } : null));

    await page.route(`**/api/v1/broadcast/${matchId}/scene`, route => json(route, programScene));
    await page.route(`**/api/v1/broadcast/${matchId}/graphic`, route => json(route, { activeTemplate: 'SCOREBUG', visible: false, breakState: { active: false } }));
    await page.route(`**/api/v1/broadcast/${matchId}/templates`, route => json(route, [
      { id: 'MATCH_STATISTICS', name: 'Match Statistics' },
      { id: 'TEAM_COMPARISON', name: 'Team Comparison' },
      { id: 'MATCH_INTRO', name: 'Match Intro' },
    ]));
    await page.route(`**/api/v1/broadcast/${matchId}/preview`, async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as any;
        const cue = body?.cue || body || {};
        previewState = { matchId, cue: { template: cue.template ?? null, payload: cue.payload || {}, duration: cue.duration ?? null, autoReturn: cue.autoReturn ?? !!cue.duration }, version: (previewState.version || 0) + 1, updatedAt: new Date().toISOString() };
        return json(route, previewState);
      }
      return json(route, previewState);
    });
    await page.route(`**/api/v1/broadcast/${matchId}/take`, async (route) => {
      const cue = previewState.cue;
      if (cue && cue.template) programScene = { ...programScene, scene: cue.template === 'MATCH_STATISTICS' ? 'MATCH_STATS' : 'HEAD_TO_HEAD', template: cue.template, payload: cue.payload || {}, version: (programScene.version || 1) + 1 };
      else programScene = { ...programScene, scene: 'PLAY', template: null, payload: {}, version: (programScene.version || 1) + 1 };
      return json(route, { scene: programScene });
    });
    await page.route(`**/api/v1/broadcast/${matchId}/clear`, async (route) => {
      programScene = { ...programScene, scene: 'PLAY', template: null, payload: {}, version: (programScene.version || 1) + 1 };
      return json(route, { scene: programScene });
    });

    await page.route('**/api/v1/system/info', route => json(route, { connectedClients: { total: (clients.scorebug + clients.graphics + clients.console + clients.other), byType: clients }, lanIpv4: ['192.168.1.10'], port: 3000, isDevUi: true }));
    await page.route('**/api/v1/system/courts**', route => json(route, { courts: [] }));
    await page.route('**/socket.io/**', route => route.abort());

    // --- Fresh login ---
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Username').fill('scorer');
    await page.locator('#password').fill('Secret123!');
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/overview/, { timeout: 15000 });

    // --- Overview checklist visible and drives next steps ---
    await expect(page.getByRole('heading', { name: /Match-day launchpad/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Match-day checklist/i)).toBeVisible();
    await expect(page.getByText('Teams', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Rosters', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Starting six saved', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Outputs connected', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Scorebug visible', { exact: true }).first()).toBeVisible();

    // Setup is ready but outputs not connected -> checklist CTA leads to Outputs
    const primaryCta = page.getByRole('button', { name: /Connect outputs|Go Live|Open Live Control|Show scorebug/i }).first();
    await expect(primaryCta).toBeVisible();
    await primaryCta.click();
    await expect(page).toHaveURL(/\/live\/m1\?tab=outputs/, { timeout: 15000 });
    await expect(page.getByText(/Send test graphic/i).first()).toBeVisible();

    // Simulate outputs connected, return to Overview and proceed to Go Live
    clients = { scorebug: 1, graphics: 1, console: 1, other: 0 };
    await page.goto('/overview', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Match-day checklist/i)).toBeVisible({ timeout: 15000 });
    const goCta = page.getByRole('button', { name: /Go Live|Open Live Control|Show scorebug/i }).first();
    await expect(goCta).toBeVisible();
    await goCta.click();
    await expect(page).toHaveURL(/\/live\/m1/, { timeout: 15000 });

    // --- Score, put graphics on air, and check output status without changing pages (tabs only) ---
    await page.getByRole('button', { name: /^Score$/ }).click();
    await expect(page).toHaveURL(/\/live\/m1\?tab=score/);
    await expect(page.getByText(/UNDO/i).first()).toBeVisible();

    await page.getByRole('button', { name: /^Graphics$/ }).click();
    await expect(page).toHaveURL(/\/live\/m1\?tab=graphics/);
    await expect(page.getByText('Preview', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Program', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: /STATS \(2\)/ }).click();
    await expect(page.getByText(/Preview:\s*MATCH STATISTICS/i)).toBeVisible();
    await page.getByRole('button', { name: /^TAKE/ }).click();
    await expect(page.getByText(/ON AIR/i).first()).toBeVisible();

    await page.getByRole('button', { name: /^Outputs$/ }).click();
    await expect(page).toHaveURL(/\/live\/m1\?tab=outputs/);
    await expect(page.getByText(/Send test graphic/i).first()).toBeVisible();
    await expect(page.getByText(/Clients connected/i).first()).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain('/live/m1');
    expect(page.url()).toContain('tab=outputs');

    // --- /broadcast console redirect (not a dead end) ---
    await page.goto(`/broadcast?match=${matchId}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/live/${matchId}\\?tab=graphics`), { timeout: 15000 });

    // --- Browser Back behaves predictably ---
    await page.goBack();
    await expect(page).toHaveURL(/\/live\/m1\?tab=outputs/, { timeout: 10000 });
  });
});

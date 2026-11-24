import { test, expect } from '@playwright/test';

test.describe('court conflict and on-air resolution', () => {
  test('paused match on court 1 blocks go-live, dialog resolves, and on-air output shows new 0-0 match', async ({ page }) => {
    const pausedId = 'm-paused';
    const newId = 'm-new';

    let loggedIn = false;
    let pausedStatus = 'PAUSED';
    let newStatus = 'SCHEDULED';
    let onAirMatchId: string | null = pausedId;
    let goLiveCalls = 0;

    const baseMatch = (id: string) => {
      const isNew = id === newId;
      const status = isNew ? newStatus : pausedStatus;
      const scoreA = isNew ? 0 : 12;
      const scoreB = isNew ? 0 : 10;
      const setsA = isNew ? 0 : 1;
      const setsB = isNew ? 0 : 0;
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
        match_no: isNew ? '25' : '24',
        match_date: '2026-11-22',
        scheduledAt: '2026-11-22T10:00:00.000Z',
        referee1: '',
        referee2: '',
        started_at: status === 'SCHEDULED' ? null : new Date().toISOString(),
        ended_at: null,
        server_time: new Date().toISOString(),
        teams: {
          A: { id: 'ta', name: isNew ? 'NEW HOME' : 'OLD HOME', shortName: isNew ? 'NH' : 'OH', logoUrl: null, primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#fff', score: scoreA, sets: setsA, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: 1, stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
          B: { id: 'tb', name: isNew ? 'NEW AWAY' : 'OLD AWAY', shortName: isNew ? 'NA' : 'OA', logoUrl: null, primaryColor: '#1d4ed8', secondaryColor: '#0f172a', textColor: '#fff', score: scoreB, sets: setsB, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: null, stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
        },
        set_scores: { A: [scoreA,0,0,0,0], B: [scoreB,0,0,0,0] },
        setHistory: [{ number: 1, scoreA, scoreB, winner: null },{number:2,scoreA:0,scoreB:0,winner:null},{number:3,scoreA:0,scoreB:0,winner:null},{number:4,scoreA:0,scoreB:0,winner:null},{number:5,scoreA:0,scoreB:0,winner:null}],
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
    await page.route('**/api/v1/auth/login', async (route) => {
      loggedIn = true;
      return json(route, { user: { id: 'u1', username: 'scorer', displayName: 'Scorer', role: 'ADMIN', mustChangePassword: false } });
    });

    await page.route('**/api/v1/system/info', route => json(route, { connectedClients: { total: 1, byType: { scorebug: 1, graphics: 0, console: 1, other: 0 } }, lanIpv4: ['127.0.0.1'], port: 3000, isDevUi: true }));
    await page.route('**/api/v1/system/courts/*/active', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = req.postDataJSON() as any;
        onAirMatchId = body?.matchId || null;
        return json(route, { court: '1', courtKey: '1', matchId: onAirMatchId });
      }
      const match = onAirMatchId ? baseMatch(onAirMatchId) : null;
      return json(route, {
        court: '1', courtKey: '1',
        matchId: onAirMatchId,
        status: match?.status || null,
        source: onAirMatchId ? 'on_air' : 'none',
        onAirMatchId,
        match: match ? { id: match.id, status: match.status, matchNumber: match.match_no, homeTeamName: match.teams.A.name, awayTeamName: match.teams.B.name } : null,
      });
    });

    await page.route('**/api/v1/matches', async (route) => {
      if (route.request().method() === 'GET') return json(route, [baseMatch(pausedId), baseMatch(newId)]);
      return route.fallback();
    });

    await page.route(`**/api/v1/matches/${newId}/go-live`, async (route) => {
      goLiveCalls += 1;
      if (pausedStatus === 'PAUSED' && onAirMatchId === pausedId) {
        return json(route, {
          error: {
            message: 'Another match is already in play on this court',
            details: { code: 'COURT_CONFLICT', conflict: { id: pausedId, court: '1', status: pausedStatus, matchNumber: '24', homeTeamName: 'OLD HOME', awayTeamName: 'OLD AWAY' }, court: '1' },
          },
        }, 409);
      }
      newStatus = 'LIVE';
      onAirMatchId = newId;
      return json(route, baseMatch(newId));
    });

    await page.route(`**/api/v1/matches/${pausedId}/status`, async (route) => {
      const body = route.request().postDataJSON() as any;
      if (body?.status) pausedStatus = body.status;
      return json(route, baseMatch(pausedId));
    });

    await page.route(`**/api/v1/matches/${newId}/status`, async (route) => {
      const body = route.request().postDataJSON() as any;
      if (body?.status) newStatus = body.status;
      return json(route, baseMatch(newId));
    });

    await page.route(`**/api/v1/matches/${newId}/readiness`, route => json(route, { matchId: newId, ready: true, canGoLive: true, checklist: [{ key: 'teams', ok: true, message: 'ok' }] }));
    await page.route(`**/api/v1/matches/${pausedId}/readiness`, route => json(route, { matchId: pausedId, ready: true, canGoLive: false, checklist: [] }));

    await page.route(`**/api/v1/matches/${newId}`, async (route) => { if (route.request().method() === 'GET') return json(route, baseMatch(newId)); return route.fallback(); });
    await page.route(`**/api/v1/matches/${pausedId}`, async (route) => { if (route.request().method() === 'GET') return json(route, baseMatch(pausedId)); return route.fallback(); });
    await page.route('**/api/v1/matches/active', route => json(route, onAirMatchId ? { matchId: onAirMatchId, status: baseMatch(onAirMatchId).status } : null));

    await page.route(`**/api/v1/broadcast/${newId}/scene`, route => json(route, { matchId: newId, scene: 'PLAY', template: null, payload: {}, startedAt: null, scorebug: { visible: true }, lock: false, timerEndsAt: null, autoTriggers: {}, version: 1, revision: 1 }));
    await page.route(`**/api/v1/broadcast/${newId}/graphic`, route => json(route, { activeTemplate: 'SCOREBUG', visible: false }));
    await page.route(`**/api/v1/broadcast/${pausedId}/scene`, route => json(route, { matchId: pausedId, scene: 'PLAY', template: null, payload: {}, startedAt: null, scorebug: { visible: true }, lock: false, timerEndsAt: null, autoTriggers: {}, version: 1, revision: 1 }));
    await page.route(`**/api/v1/broadcast/${pausedId}/graphic`, route => json(route, { activeTemplate: 'SCOREBUG', visible: false }));
    await page.route('**/socket.io/**', route => route.abort());

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Username').fill('scorer');
    await page.locator('#password').fill('Secret123!');
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/overview/, { timeout: 15000 });

    await page.goto('/matches', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('NEW HOME')).toBeVisible({ timeout: 15000 });
    const newRow = page.locator('div', { hasText: 'NEW HOME' }).filter({ hasText: 'Go live' }).first();
    await newRow.getByRole('button', { name: /Go live/i }).click();

    await expect(page.getByText(/Court already in use/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/#24 OLD HOME vs OLD AWAY/i)).toBeVisible();
    await page.getByRole('button', { name: /Pause it and switch/i }).click();

    await expect.poll(() => goLiveCalls).toBeGreaterThanOrEqual(2);
    await expect.poll(() => onAirMatchId).toBe(newId);

    await page.goto('/out/court/1/all?debug=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-overlay-debug]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('body')).toContainText(/NEW HOME|NH/i);
    await expect(page.locator('body')).toContainText(/\b0\b/);
    await expect(page.locator('body')).not.toContainText(/OLD HOME|OH/i);
  });
});

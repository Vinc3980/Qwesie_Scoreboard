import { test, expect } from '@playwright/test';

test.describe('court output resolution', () => {
  test('resolves /out/court/1 and /out/court/court-1 to the same match', async ({ page }) => {
    const matchId = 'match-court-1-same';
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
      match_no: 'C1',
      match_date: '2026-11-19',
      referee1: '',
      referee2: '',
      started_at: new Date().toISOString(),
      ended_at: null,
      server_time: new Date().toISOString(),
      teams: {
        A: { name: 'ALPHA VC', shortName: 'ALP', logoUrl: null, primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#fff', score: 12, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: 1, stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
        B: { name: 'BETA VC', shortName: 'BET', logoUrl: null, primaryColor: '#1d4ed8', secondaryColor: '#0f172a', textColor: '#fff', score: 10, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: null, stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
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
      revision: 7,
      lastEvent: null,
      rules: { bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, rallyScoring: true, timeoutsPerSet: 2, substitutionsPerSet: 6 },
      rotationLocked: false,
    };
    const sceneState = {
      matchId,
      scene: 'PLAY',
      lock: false,
      timerEndsAt: null,
      autoTriggers: {},
      version: 1,
      revision: 7,
      scorebug: { visible: true, position: 'top-left', scale: 1, variant: 'classic', showSetHistory: false, showPreMatch: true },
    };

    await page.route('**/api/v1/system/courts/*/active', async (route) => {
      const url = new URL(route.request().url());
      const courtParam = decodeURIComponent(url.pathname.split('/').pop() || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { court: courtParam, matchId, status: 'LIVE' }, timestamp: new Date().toISOString() }),
      });
    });
    await page.route(`**/api/v1/matches/${matchId}`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: matchState, timestamp: new Date().toISOString() }) });
    });
    await page.route(`**/api/v1/broadcast/${matchId}/scene`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: sceneState, timestamp: new Date().toISOString() }) });
    });
    await page.route(`**/api/v1/broadcast/${matchId}/graphic`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { activeTemplate: 'SCOREBUG', visible: false }, timestamp: new Date().toISOString() }) });
    });
    await page.route('**/socket.io/**', async (route) => route.abort());

    await page.goto('/out/court/1/all?debug=1', { waitUntil: 'domcontentloaded' });
    const debug1 = page.locator('[data-overlay-debug]');
    await expect(debug1).toBeVisible({ timeout: 15000 });
    await expect(debug1).toContainText('match');
    await expect(page.locator('body')).toContainText(/ALPHA|ALP/i);

    const text1 = await page.locator('body').innerText();

    await page.goto('/out/court/court-1/all?debug=1', { waitUntil: 'domcontentloaded' });
    const debug2 = page.locator('[data-overlay-debug]');
    await expect(debug2).toBeVisible({ timeout: 15000 });
    await expect(debug2).toContainText('court-1');
    await expect(page.locator('body')).toContainText(/ALPHA|ALP/i);

    // Both outputs resolved to the same match (same team shown; debug shows match identity)
    await expect(page.locator('body')).toContainText(/BETA|BET/i);
    expect(text1).toMatch(/ALPHA|ALP/i);
  });
});

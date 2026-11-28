import { test, expect } from '@playwright/test';

const json = (route: any, data: any, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: status < 400, data, timestamp: new Date().toISOString(), ...(status >= 400 ? { error: { message: data?.message || 'Error' } } : {}) }),
  });

test.describe('Player attribution flow', () => {
  test('taps Ace then a player and sees stats update', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('qwesie-theme', 'light'); } catch {} });
    await page.route('**/api/v1/auth/bootstrap-status', r => json(r, { needsBootstrap: false, setupTokenRequired: false }));
    await page.route('**/api/v1/auth/smtp-status', r => json(r, { enabled: false }));
    await page.route('**/api/v1/auth/me', r => json(r, { user: { id: 'u1', username: 'admin', displayName: 'Admin', role: 'ADMIN', mustChangePassword: false } }));
    await page.route('**/api/v1/system/**', r => json(r, { connectedClients: { total: 0, byType: {} }, lanIpv4: [] }));
    await page.route('**/api/v1/broadcast/**', r => json(r, { scene: { scene: 'PLAY', scorebug: { visible: true }, autoTriggers: { attributionOnAir: 'off' } }, cue: null, version: 0, templates: [], graphic: { activeTemplate: 'SCOREBUG' } }));
    await page.route('**/socket.io/**', r => r.abort());

    const matchId = 'm1';
    let attributedPlayerId: string | null = null;
    let aceCount = 0;

    const makeState = () => ({
      id: matchId, status: 'LIVE', current_set: 1, max_sets: 5,
      match_no: 'M-1', court: 'Court 1', tournament: 'League', division: 'A', scheduledAt: new Date().toISOString(),
      teams: {
        A: {
          id: 'ta', name: 'Home Team', shortName: 'HOM', primaryColor: '#0ea5e9', textColor: '#fff', logoUrl: null,
          score: aceCount, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, substitutionsPerSet: 6, substitutionsUsed: 0,
          lineup: [{ id: 'p1', name: 'Alice Server', jerseyNumber: 1, position: 'OH', isCaptain: false, isLibero: false, thumbUrl: null, photoUrl: null, stats: { ace: aceCount, points: aceCount } }],
          bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: 1, stats: { ace: aceCount }
        },
        B: {
          id: 'tb', name: 'Away Team', shortName: 'AWY', primaryColor: '#f97316', textColor: '#fff', logoUrl: null,
          score: 0, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, substitutionsPerSet: 6, substitutionsUsed: 0,
          lineup: [{ id: 'p2', name: 'Bob', jerseyNumber: 2, position: 'MB', isCaptain: false, isLibero: false }], bench: [], rotationOrder: [1,2,3,4,5,6], serverPosition: null, stats: {}
        },
      },
      setHistory: [], events: [
        { id: 'e1', seq: 1, team: 'A', action: 'ACTION_RECORDED', time: '12:00:00', payload: { action: 'ACE', playerId: attributedPlayerId }, playerId: attributedPlayerId, clientEventId: 'c1' }
      ],
      flags: { setPoint: null, matchPoint: null, setWon: null, matchWon: null, pendingEnd: false, courtSwitchDue: false, isDecidingSet: false, technicalTimeoutDue: false },
      rules: { bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, timeoutsPerSet: 2, substitutionsPerSet: 6 },
      server: 'A', referee1: '', referee2: '', match_date: '', started_at: '', ended_at: null, revision: 1 + aceCount, lastEvent: { id: 'e1', action: 'ACTION_RECORDED', payload: { action: 'ACE', playerId: attributedPlayerId } },
    });

    await page.route('**/api/v1/matches/**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();
      if (method === 'POST' && /\/action$/.test(url)) {
        aceCount = 1;
        attributedPlayerId = null;
        return json(route, makeState());
      }
      if (method === 'PATCH' && /\/events\/.*\/attribution$/.test(url)) {
        const body = req.postDataJSON() as any;
        attributedPlayerId = body?.playerId || null;
        return json(route, makeState());
      }
      if (method === 'GET' && /\/matches\/m1(\?|$)/.test(url)) return json(route, makeState());
      if (method === 'GET' && /\/matches(\?|$)/.test(url)) return json(route, [makeState()]);
      return json(route, makeState());
    });

    await page.goto('/live/m1', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Home Team|HOM/i).first()).toBeVisible();

    await page.getByRole('button', { name: /^ACE$/i }).first().click();
    await page.getByRole('button', { name: /#1 Alice Server/i }).first().click();

    await expect(page.getByText(/attributed/i).first()).toBeVisible();
    expect(attributedPlayerId).toBe('p1');
  });
});

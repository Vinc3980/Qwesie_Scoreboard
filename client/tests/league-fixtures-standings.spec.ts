import { test, expect } from '@playwright/test';

const json = (route: any, data: any, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data, timestamp: new Date().toISOString() }) });

test.describe('League fixtures and standings', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('qwesie-theme', 'light'); } catch {} });
    await page.route('**/api/v1/auth/bootstrap-status', r => json(r, { needsBootstrap: false, setupTokenRequired: false }));
    await page.route('**/api/v1/auth/smtp-status', r => json(r, { enabled: false }));
    await page.route('**/api/v1/auth/me', r => json(r, { user: { id: 'u1', username: 'admin', displayName: 'Admin', role: 'ADMIN', mustChangePassword: false } }));
    await page.route('**/api/v1/system/**', r => json(r, { connectedClients: { total: 0, byType: {} }, lanIpv4: [] }));
    await page.route('**/socket.io/**', r => r.abort());
  });

  test('filters fixtures by today and shows leaderboard', async ({ page }) => {
    const comp = { id: 'c1', name: 'League One', season: '2026', _count: { matches: 2 } };
    const today = new Date(); today.setHours(12,0,0,0);
    await page.route('**/api/v1/competitions**', async (route) => {
      const url = route.request().url();
      if (/\/competitions\/c1\/standings/.test(url)) {
        return json(route, { competitionId:'c1', competitionName:'League One', rows: [
          { rank:1, teamId:'t1', teamName:'Alpha', shortName:'ALP', logoUrl:null, played:1, won:1, lost:0, setsFor:3, setsAgainst:0, setRatio:3, pointsFor:75, pointsAgainst:50, pointRatio:1.5, matchPoints:3, form:['W'] },
          { rank:2, teamId:'t2', teamName:'Beta', shortName:'BET', logoUrl:null, played:1, won:0, lost:1, setsFor:0, setsAgainst:3, setRatio:0, pointsFor:50, pointsAgainst:75, pointRatio:0.67, matchPoints:0, form:['L'] },
        ], qualificationZones: [], tieBreakOrder:['points','wins','setRatio','pointRatio','headToHead'] });
      }
      if (/\/competitions\/c1\/fixtures/.test(url)) {
        expect(url).toContain('from=');
        return json(route, { items: [{ id:'m1', scheduledAt: today.toISOString(), status:'SCHEDULED', court:'Court 1', division:'A', homeTeamName:'Alpha', awayTeamName:'Beta', homeTeam:{shortName:'ALP'}, awayTeam:{shortName:'BET'}, setsWonHome:0, setsWonAway:0 }], total:1, limit:200, offset:0 });
      }
      if (/\/competitions\/c1\/divisions/.test(url)) return json(route, ['A']);
      if (/\/competitions\/c1$/.test(url)) return json(route, comp);
      return json(route, [comp]);
    });
    await page.route('**/api/v1/broadcast/**', r => json(r, { scene: { scene:'PLAY' }, cue:null, version:0 }));

    await page.goto('/fixtures');
    await expect(page.getByText('Fixtures')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Alpha/)).toBeVisible({ timeout: 10000 });

    await page.goto('/leaderboard');
    await expect(page.getByText('Leaderboard')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Alpha')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('3')).toBeVisible();
  });
});

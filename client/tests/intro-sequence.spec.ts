import { test, expect } from '@playwright/test';

const json = (route: any, data: any, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data, timestamp: new Date().toISOString() }) });

test.describe('Intro sequence', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('qwesie-theme', 'light'); } catch {} });
    await page.route('**/api/v1/auth/bootstrap-status', r => json(r, { needsBootstrap: false, setupTokenRequired: false }));
    await page.route('**/api/v1/auth/smtp-status', r => json(r, { enabled: false }));
    await page.route('**/api/v1/auth/me', r => json(r, { user: { id: 'u1', username: 'admin', displayName: 'Admin', role: 'ADMIN', mustChangePassword: false } }));
    await page.route('**/api/v1/system/**', r => json(r, { connectedClients: { total: 0, byType: {} }, lanIpv4: [] }));
    await page.route('**/socket.io/**', r => r.abort());
  });

  test('runs sequence and shows each step on output in order', async ({ page }) => {
    const matchId = 'm1';
    const steps = [
      { template: 'MATCH_INTRO', payload: {} },
      { template: 'TEAM_SQUAD_PROFILES', payload: { team: 'A', page: 0, pageSize: 3 } },
      { template: 'STARTING_SIX_COURT', payload: { team: 'A', setNumber: 1 } },
      { template: 'TEAM_SQUAD_PROFILES', payload: { team: 'B', page: 0, pageSize: 3 } },
      { template: 'STARTING_SIX_COURT', payload: { team: 'B', setNumber: 1 } },
    ];
    let idx = 0;
    const mkState = () => ({ matchId, scene: 'LINEUPS', template: steps[idx].template, payload: steps[idx].payload, visible: true, scorebugVisible: true, timerEndsAt: null, lockScene: false, scorebug: { visible: true }, version: idx + 1 });

    const match = {
      id: matchId, status: 'LIVE', current_set: 1, max_sets: 5, match_no: 'M-1', court: 'Court 1', tournament: 'League', division: 'A', scheduledAt: new Date().toISOString(),
      teams: {
        A: { id: 'ta', name: 'Home Team', shortName: 'HOM', logoUrl: null, primaryColor: '#0ea5e9', textColor: '#fff', coachName: 'Coach H', score: 0, sets: 0, timeouts: 2, lineup: Array.from({length:6},(_,i)=>({id:,jerseyNumber:i+1,name:Home ,position:'OH',photoUrl:null,thumbUrl:null,isCaptain:i===0,isLibero:false})), bench: [], rotationOrder:[1,2,3,4,5,6], serverPosition:1, stats:{} },
        B: { id: 'tb', name: 'Away Team', shortName: 'AWY', logoUrl: null, primaryColor: '#f97316', textColor: '#fff', coachName: 'Coach A', score: 0, sets: 0, timeouts: 2, lineup: Array.from({length:6},(_,i)=>({id:,jerseyNumber:i+1,name:Away ,position:'MB',photoUrl:null,thumbUrl:null,isCaptain:false,isLibero:false})), bench: [], rotationOrder:[1,2,3,4,5,6], serverPosition:null, stats:{} },
      },
      setHistory: [], events: [], flags: {}, rules: { bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, timeoutsPerSet: 2, substitutionsPerSet: 6 },
      server: 'A', revision: 1, lastEvent: null,
    };

    await page.route('**/api/v1/matches/m1**', r => json(r, match));
    await page.route('**/api/v1/broadcast/m1/graphic', r => json(r, mkState()));
    await page.route('**/api/v1/broadcast/m1/scene', r => json(r, mkState()));
    await page.route('**/api/v1/broadcast/templates', r => json(r, []));

    await page.goto('/broadcast/m1/graphics');
    await expect(page.getByText('Match Introduction')).toBeVisible({ timeout: 10000 });

    idx = 1;
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); });
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Home Team Squad|HOM Squad/i)).toBeVisible({ timeout: 10000 });

    idx = 2;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Starting Six/i)).toBeVisible({ timeout: 10000 });

    idx = 3;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Away Team Squad|AWY Squad/i)).toBeVisible({ timeout: 10000 });

    idx = 4;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Starting Six/i)).toBeVisible({ timeout: 10000 });
  });
});

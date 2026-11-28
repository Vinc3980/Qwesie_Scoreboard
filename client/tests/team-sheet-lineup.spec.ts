import { test, expect } from '@playwright/test';

const json = (route: any, data: any, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: status < 400, data, timestamp: new Date().toISOString(), ...(status >= 400 ? { error: { message: data?.message || 'Error' } } : {}) }),
  });

test.describe('Court diagram lineup and team sheet', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('qwesie-theme', 'light'); } catch {} });
    await page.route('**/api/v1/auth/bootstrap-status', r => json(r, { needsBootstrap: false, setupTokenRequired: false }));
    await page.route('**/api/v1/auth/smtp-status', r => json(r, { enabled: false }));
    await page.route('**/api/v1/auth/me', r => json(r, { user: { id: 'u1', username: 'admin', displayName: 'Admin', role: 'ADMIN', mustChangePassword: false } }));
    await page.route('**/api/v1/system/**', r => json(r, { connectedClients: { total: 0, byType: {} }, lanIpv4: [] }));
    await page.route('**/api/v1/broadcast/**', r => json(r, { scene: { scene: 'PLAY', scorebug: { visible: true } }, cue: null, version: 0 }));
    await page.route('**/socket.io/**', r => r.abort());
  });

  test('picks lineup through diagram and exports team sheet', async ({ page }) => {
    const matchId = 'm1';
    const teams = [
      { id: 'ta', name: 'Home Team', shortName: 'HOM', primaryColor: '#0ea5e9', textColor: '#fff' },
      { id: 'tb', name: 'Away Team', shortName: 'AWY', primaryColor: '#f97316', textColor: '#fff' },
    ];
    const rosterA = Array.from({ length: 6 }).map((_, i) => ({ id: `ha${i+1}`, name: `Home ${i+1}`, jerseyNumber: i+1, photoUrl: null, thumbUrl: null, isLibero: i===5, position: 'OH' }));
    const rosterB = Array.from({ length: 6 }).map((_, i) => ({ id: `ab${i+1}`, name: `Away ${i+1}`, jerseyNumber: i+1, photoUrl: null, thumbUrl: null, isLibero: false, position: 'MB' }));
    let savedLineup: any = null;

    const matchState: any = {
      id: matchId, status: 'SCHEDULED', current_set: 1, max_sets: 5,
      match_no: 'M-1', court: 'Court 1', tournament: 'League', division: 'A', scheduledAt: new Date().toISOString(),
      teams: {
        A: { id: 'ta', name: 'Home Team', shortName: 'HOM', primaryColor: '#0ea5e9', textColor: '#fff', logoUrl: null, score: 0, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: rosterA, rotationOrder: [1,2,3,4,5,6], serverPosition: 1, stats: {} },
        B: { id: 'tb', name: 'Away Team', shortName: 'AWY', primaryColor: '#f97316', textColor: '#fff', logoUrl: null, score: 0, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, lineup: [], bench: rosterB, rotationOrder: [1,2,3,4,5,6], serverPosition: null, stats: {} },
      },
      setHistory: [], events: [], flags: { setPoint: null, matchPoint: null, setWon: null, matchWon: null, pendingEnd: false, courtSwitchDue: false, isDecidingSet: false, technicalTimeoutDue: false },
      rules: { bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, timeoutsPerSet: 2, substitutionsPerSet: 6 },
      server: 'A', referee1: '', referee2: '', match_date: '', started_at: '', ended_at: null, revision: 1, lastEvent: null,
    };

    await page.route('**/api/v1/teams**', r => json(r, teams));
    await page.route('**/api/v1/competitions**', r => json(r, []));
    await page.route('**/api/v1/matches**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() === 'GET' && /\/matches\/m1\/team-sheet/.test(url)) {
        return json(route, {
          matchId, matchNumber: 'M-1', scheduledAt: new Date().toISOString(), competition: 'League', division: 'A', court: 'Court 1', venueType: 'INDOOR', referee1: 'R1', referee2: 'R2',
          sets: [{ setNumber: 1, status: 'PENDING', homePoints: 0, awayPoints: 0, winnerSide: null }],
          teams: {
            A: { side: 'A', teamId: 'ta', name: 'Home Team', shortName: 'HOM', logoUrl: null, primaryColor: '#0ea5e9', textColor: '#fff', coachName: 'Coach H', assistantCoachName: 'Asst H', managerName: null, roster: rosterA.map(p => ({ playerId: p.id, jerseyNumber: p.jerseyNumber, name: p.name, position: p.position, isCaptain: p.jerseyNumber===1, isLibero: p.isLibero, photoUrl: null, thumbUrl: null })), setLineups: [{ setNumber: 1, slots: rosterA.map((p,i)=>({ rotationPos:i+1, playerId:p.id, jerseyNumber:p.jerseyNumber, name:p.name, photoUrl:null, thumbUrl:null })) }] },
            B: { side: 'B', teamId: 'tb', name: 'Away Team', shortName: 'AWY', logoUrl: null, primaryColor: '#f97316', textColor: '#fff', coachName: 'Coach A', assistantCoachName: null, managerName: null, roster: rosterB.map(p => ({ playerId: p.id, jerseyNumber: p.jerseyNumber, name: p.name, position: p.position, isCaptain: false, isLibero: false, photoUrl: null, thumbUrl: null })), setLineups: [{ setNumber: 1, slots: rosterB.map((p,i)=>({ rotationPos:i+1, playerId:p.id, jerseyNumber:p.jerseyNumber, name:p.name, photoUrl:null, thumbUrl:null })) }] },
          },
        });
      }
      if (req.method() === 'GET' && /\/matches\/m1\/readiness/.test(url)) {
        return json(route, { matchId, ready: !!savedLineup, canGoLive: !!savedLineup, checklist: [{ key: 'teams', ok: true, message: 'Both teams are set' }, { key: 'roster_HOME', ok: true, message: 'HOME roster has 6 players' }, { key: 'roster_AWAY', ok: true, message: 'AWAY roster has 6 players' }, { key: 'lineup_HOME_set1', ok: !!savedLineup, message: savedLineup ? 'HOME has a valid starting six for set 1' : 'HOME must have a valid starting six for set 1 (6 rostered players, positions 1-6, max 1 libero)' }, { key: 'lineup_AWAY_set1', ok: !!savedLineup, message: savedLineup ? 'AWAY has a valid starting six for set 1' : 'AWAY must have a valid starting six for set 1 (6 rostered players, positions 1-6, max 1 libero)' }] });
      }
      if (req.method() === 'GET' && /\/matches\/m1(\?|$)/.test(url)) return json(route, matchState);
      if (req.method() === 'GET' && /\/matches(\?|$)/.test(url)) return json(route, [{ id: matchId, status: 'SCHEDULED', match_no: 'M-1', court: 'Court 1', tournament: 'League', teams: { A: { id: 'ta', name: 'Home Team', shortName: 'HOM' }, B: { id: 'tb', name: 'Away Team', shortName: 'AWY' } } }]);
      if (req.method() === 'POST' && /\/matches(\?|$)/.test(url)) return json(route, matchState);
      if (req.method() === 'PUT' && /\/lineup\/A\/1/.test(url)) { savedLineup = req.postDataJSON(); return json(route, matchState); }
      if (req.method() === 'PUT' && /\/lineup\/B\/1/.test(url)) { savedLineup = req.postDataJSON(); return json(route, matchState); }
      if (req.method() === 'PUT' && /\/roster\//.test(url)) return json(route, matchState);
      if (req.method() === 'PUT' && /\/matches\/m1/.test(url)) return json(route, matchState);
      return json(route, matchState);
    });

    await page.goto('/matches/m1/setup?step=4', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/starting six/i).first()).toBeVisible();

    // Assign Home P1 by clicking P1 slot then selecting player
    await page.getByRole('button', { name: /P1 back right/i }).first().click();
    await page.getByRole('button', { name: /#1 Home 1/i }).first().click();

    // Assign remaining home slots quickly via roster clicks after selecting slot
    for (const [pos, num] of [[2,2],[3,3],[4,4],[5,5],[6,6]] as const) {
      await page.getByRole('button', { name: new RegExp(`P${pos} `) }).first().click();
      await page.getByRole('button', { name: new RegExp(`#${num} Home ${num}`) }).first().click();
    }

    await page.getByRole('button', { name: /Save lineup/i }).first().click();

    // Go to review and open team sheet
    await page.getByRole('button', { name: /^Next/i }).click();
    await page.getByRole('button', { name: /^Next/i }).click().catch(() => {}); // may already be on step 5 depending on state
    await page.goto('/matches/m1/setup?step=5', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /Team sheet/i })).toBeVisible();
    await page.getByRole('link', { name: /Team sheet/i }).click();

    await expect(page.getByText(/OFFICIAL TEAM SHEET/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Print/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Download PDF/i })).toBeVisible();
    await expect(page.getByText(/Home Team/i).first()).toBeVisible();
  });
});

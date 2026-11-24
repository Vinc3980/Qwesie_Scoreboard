import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../docs/ui-audit');

const json = (route: any, data: any, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      success: status < 400,
      data,
      timestamp: new Date().toISOString(),
      ...(status >= 400 ? { error: { message: data?.message || 'Error' } } : {}),
    }),
  });

async function mockConsoleApis(page: Page) {
  let loggedIn = true;
  await page.route('**/api/v1/auth/bootstrap-status', r => json(r, { needsBootstrap: false, setupTokenRequired: false }));
  await page.route('**/api/v1/auth/smtp-status', r => json(r, { enabled: false }));
  await page.route('**/api/v1/auth/me', r => json(r, { user: { id: 'u1', username: 'admin', displayName: 'Admin', role: 'ADMIN', mustChangePassword: false } }));
  await page.route('**/api/v1/auth/login', r => json(r, { user: { id: 'u1', username: 'admin', displayName: 'Admin', role: 'ADMIN' } }));
  await page.route('**/api/v1/auth/logout', r => json(r, { ok: true }));
  await page.route('**/api/v1/matches**', r => json(r, [
    { id: 'm1', match_no: '1', status: 'SCHEDULED', court: '1', tournament: 'League', division: 'A', scheduledAt: new Date().toISOString(), teams: { A: { id: 't1', name: 'Home', shortName: 'HOM', sets: 0, score: 0 }, B: { id: 't2', name: 'Away', shortName: 'AWY', sets: 0, score: 0 } } }
  ]));
  // Full state so /live renders the real operator console, not the error boundary.
  const liveMatch = {
    id: 'm1', match_no: '1', status: 'LIVE', court: '1', tournament: 'League', division: 'A',
    current_set: 1, max_sets: 5, server: 'A', winner: null,
    started_at: new Date().toISOString(), ended_at: null, match_date: '2026-11-20',
    teams: {
      A: { name: 'Home', shortName: 'HOM', logoUrl: null, primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#fff', score: 12, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, rotationOrder: [1,2,3,4,5,6], serverPosition: 1, lineup: [
        { id: 'a1', jerseyNumber: 1, name: 'Alpha One', position: 'OH' },
        { id: 'a2', jerseyNumber: 2, name: 'Alpha Two', position: 'MB' },
        { id: 'a3', jerseyNumber: 3, name: 'Alpha Three', position: 'OPP' },
        { id: 'a4', jerseyNumber: 4, name: 'Alpha Four', position: 'S' },
        { id: 'a5', jerseyNumber: 5, name: 'Alpha Five', position: 'OH' },
        { id: 'a6', jerseyNumber: 6, name: 'Alpha Six', position: 'L', isLibero: true },
      ], bench: [], stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
      B: { name: 'Away', shortName: 'AWY', logoUrl: null, primaryColor: '#1d4ed8', secondaryColor: '#0f172a', textColor: '#fff', score: 10, sets: 0, timeouts: 2, timeoutsUsed: 0, timeoutsPerSet: 2, rotationOrder: [1,2,3,4,5,6], serverPosition: null, lineup: [
        { id: 'b1', jerseyNumber: 1, name: 'Beta One', position: 'OH' },
        { id: 'b2', jerseyNumber: 2, name: 'Beta Two', position: 'MB' },
        { id: 'b3', jerseyNumber: 3, name: 'Beta Three', position: 'OPP' },
        { id: 'b4', jerseyNumber: 4, name: 'Beta Four', position: 'S' },
        { id: 'b5', jerseyNumber: 5, name: 'Beta Five', position: 'OH' },
        { id: 'b6', jerseyNumber: 6, name: 'Beta Six', position: 'L', isLibero: true },
      ], bench: [], stats: { kill: 0, error: 0, ace: 0, block: 0, dig: 0, assist: 0, side_out: 0 } },
    },
    set_scores: { A: [12, 0, 0, 0, 0], B: [10, 0, 0, 0, 0] },
    setHistory: [1,2,3,4,5].map(number => ({ number, scoreA: number === 1 ? 12 : 0, scoreB: number === 1 ? 10 : 0, winner: null })),
    events: [], flags: { setPoint: null, matchPoint: null, setWon: null, matchWon: null, courtSwitchDue: false, isDecidingSet: false, technicalTimeoutDue: false },
    revision: 1, lastEvent: null, rotationLocked: false,
    rules: { bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, rallyScoring: true, timeoutsPerSet: 2, substitutionsPerSet: 6 },
  };
  await page.route('**/api/v1/matches/current', r => json(r, liveMatch));
  await page.route('**/api/v1/teams**', r => {
    if (r.request().url().includes('/players')) return json(r, []);
    return json(r, [{ id: 't1', name: 'Home', shortName: 'HOM' }, { id: 't2', name: 'Away', shortName: 'AWY' }]);
  });
  await page.route('**/api/v1/players**', r => json(r, []));
  await page.route('**/api/v1/competitions**', r => json(r, []));
  await page.route('**/api/v1/broadcast/**', r => json(r, { scene: { scene: 'PLAY', scorebug: { visible: true } }, previewScene: null, timers: [], courtScenes: [] }));
  await page.route('**/api/v1/system/**', r => json(r, { connectedClients: { total: 0, byType: { scorebug: 0, graphics: 0, console: 1, other: 0 } }, lanIpv4: ['127.0.0.1'], port: 3000, courts: [] }));
  await page.route('**/api/v1/reports/**', r => json(r, []));
  await page.route('**/api/v1/auth/users**', r => json(r, []));
  await page.route('**/socket.io/**', r => r.abort());
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => {
    try { localStorage.setItem('qwesie-theme', t); } catch {}
  }, theme);
}

function safeName(route: string) {
  const s = route.replace(/^\//, '').replace(/[^a-zA-Z0-9-_]+/g, '_') || 'root';
  return s.slice(0, 80);
}

test.describe('console contrast (axe)', () => {
  const routes = [
    '/overview',
    '/matches',
    '/teams',
    '/players',
    '/competitions',
    '/live',
    '/statistics',
    '/archive',
    '/reports',
    '/settings',
    '/users',
  ];

  for (const theme of ['light', 'dark'] as const) {
    for (const route of routes) {
      test(`${route} has no serious/critical color-contrast violations (${theme})`, async ({ page }) => {
        fs.mkdirSync(OUT_DIR, { recursive: true });
        await setTheme(page, theme);
        await mockConsoleApis(page);
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        // Wait for the console shell/content, not just the route skeleton.
        await page.waitForSelector('main', { state: 'attached', timeout: 15_000 });
        // allow route content to settle
        await page.waitForTimeout(800);
        const screenshotPath = path.join(OUT_DIR, `${safeName(route)}-${theme}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        const results = await new AxeBuilder({ page })
          .withRules(['color-contrast'])
          .analyze();
        const bad = results.violations.filter(v => v.id === 'color-contrast' && (v.impact === 'serious' || v.impact === 'critical'));
        expect(bad, `Contrast violations on ${route} (${theme}): ${JSON.stringify(bad.map(v => ({ impact: v.impact, nodes: v.nodes.length })), null, 2)}`).toEqual([]);
      });
    }
  }
});

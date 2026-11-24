import { test, expect } from '@playwright/test';

const json = (route: any, data: any, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: status < 400, data, timestamp: new Date().toISOString(), ...(status >= 400 ? { error: { message: data?.message || 'Error', ...(data?.issues ? { issues: data.issues } : {}) } } : {}) }),
  });

test.describe('Match setup wizard roster prefill', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('qwesie-theme', 'light'); } catch {} });
    await page.route('**/api/v1/auth/bootstrap-status', r => json(r, { needsBootstrap: false, setupTokenRequired: false }));
    await page.route('**/api/v1/auth/smtp-status', r => json(r, { enabled: false }));
    await page.route('**/api/v1/auth/me', r => json(r, { user: { id: 'u1', username: 'admin', displayName: 'Admin', role: 'ADMIN', mustChangePassword: false } }));
    await page.route('**/api/v1/competitions**', r => json(r, []));
    await page.route('**/api/v1/system/**', r => json(r, { connectedClients: { total: 0, byType: {} }, lanIpv4: [] }));
    await page.route('**/api/v1/broadcast/**', r => json(r, { scene: { scene: 'PLAY', scorebug: { visible: true } } }));
    await page.route('**/socket.io/**', r => r.abort());
  });

  test('prefills 12 players with accurate toast count when all have jersey numbers', async ({ page }) => {
    const players = Array.from({ length: 12 }).map((_, i) => ({
      id: `p${i + 1}`, displayName: `Player ${i + 1}`, jerseyNumber: i + 1, position: 'OH', isCaptain: i === 0, isLibero: false,
    }));
    await page.route('**/api/v1/teams**', async (route) => {
      const url = route.request().url();
      if (/\/teams\/t1\/players/.test(url)) return json(route, players);
      return json(route, [{ id: 't1', name: 'Home Team', shortName: 'HOM' }, { id: 't2', name: 'Away Team', shortName: 'AWY' }]);
    });
    await page.route('**/api/v1/matches**', r => json(r, []));

    await page.goto('/matches/new', { waitUntil: 'domcontentloaded' });
    // Step 2: select home team
    await page.getByRole('button', { name: /^2\. Teams$/ }).click();
    await page.getByLabel('Home team').selectOption('t1');
    // Step 3: prefill
    await page.getByRole('button', { name: /^3\. Rosters$/ }).click();
    const prefill = page.getByRole('button', { name: /Pre-fill from team/i }).first();
    await prefill.click();

    await expect(page.getByText(/Loaded 12 players/i)).toBeVisible();
    // 12 data rows present
    // Home roster table (first) should have 12 rows; away keeps default rows
    await expect(page.locator('table').first().locator('tbody tr')).toHaveCount(12);
  });

  test('shows missing jersey warning, highlights rows, and auto-numbers without sending 0', async ({ page }) => {
    const players = [
      { id: 'p1', displayName: 'Has Jersey', jerseyNumber: 4, position: 'S' },
      { id: 'p2', displayName: 'Missing Jersey', jerseyNumber: null, position: 'OH' },
      { id: 'p3', displayName: 'Also Missing', jerseyNumber: null, position: 'MB' },
    ];
    await page.route('**/api/v1/teams**', async (route) => {
      const url = route.request().url();
      if (/\/teams\/t1\/players/.test(url)) return json(route, players);
      return json(route, [{ id: 't1', name: 'Home Team', shortName: 'HOM' }, { id: 't2', name: 'Away Team', shortName: 'AWY' }]);
    });
    await page.route('**/api/v1/matches**', r => json(r, []));

    await page.goto('/matches/new', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^2\. Teams$/ }).click();
    await page.getByLabel('Home team').selectOption('t1');
    await page.getByRole('button', { name: /^3\. Rosters$/ }).click();
    await page.getByRole('button', { name: /Pre-fill from team/i }).first().click();

    await expect(page.getByText(/Loaded 3 players \(2 need jersey numbers\)/i)).toBeVisible();
    await expect(page.getByText(/2 need jersey numbers/i).first()).toBeVisible();

    // clicking save should be blocked with specific row message (no request with jersey 0)
    let sawSaveRequest = false;
    await page.route('**/api/v1/matches/*/roster/**', async (route) => {
      sawSaveRequest = true;
      const body = route.request().postDataJSON() as any;
      // must never contain jerseyNumber 0
      expect(JSON.stringify(body)).not.toContain('"jerseyNumber":0');
      return json(route, body?.players || []);
    });
    await page.getByRole('button', { name: /^Save roster$/ }).first().click();
    await expect(page.getByText(/row 2: jersey number/i)).toBeVisible();
    expect(sawSaveRequest).toBeFalsy();

    // Auto-number fills missing jerseys
    await page.getByRole('button', { name: /Auto-number/i }).first().click();
    const jerseyInputs = page.locator('table').first().locator('tbody tr input[data-col="jersey"]');
    await expect(jerseyInputs.nth(1)).not.toHaveValue('');
    await expect(jerseyInputs.nth(2)).not.toHaveValue('');
  });

  test('shows warning and link when team has no players (no success toast)', async ({ page }) => {
    await page.route('**/api/v1/teams**', async (route) => {
      const url = route.request().url();
      if (/\/teams\/t1\/players/.test(url)) return json(route, []);
      return json(route, [{ id: 't1', name: 'Home Team', shortName: 'HOM' }]);
    });
    await page.route('**/api/v1/matches**', r => json(r, []));

    await page.goto('/matches/new', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^2\. Teams$/ }).click();
    await page.getByLabel('Home team').selectOption('t1');
    await page.getByRole('button', { name: /^3\. Rosters$/ }).click();
    await page.getByRole('button', { name: /Pre-fill from team/i }).first().click();

    await expect(page.getByText('This team has no players yet.').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Add players/i })).toBeVisible();
    await expect(page.getByText(/Loaded 0 players/i)).toHaveCount(0);
  });
});

import { test, expect } from '@playwright/test';

const json = (route: any, data: any, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: status < 400, data, timestamp: new Date().toISOString(), ...(status >= 400 ? { error: { message: data?.message || 'Error' } } : {}) }),
  });

const PNG_1X1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63f80f0000000101005be6d5b30000000049454e44ae426082', 'hex');

test.describe('Team and player images', () => {
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

  test('registers and edits a team with images', async ({ page }) => {
    const teams: any[] = [];
    let uploadCount = 0;
    await page.route('**/api/v1/uploads', async (route) => {
      uploadCount += 1;
      return json(route, { url: `/uploads/mock-${uploadCount}.webp`, thumbUrl: `/uploads/mock-${uploadCount}.thumb.webp`, key: `teams/logos/mock-${uploadCount}.webp`, thumbKey: `teams/logos/mock-${uploadCount}.thumb.webp` });
    });
    await page.route('**/api/v1/teams**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() === 'GET' && /\/api\/v1\/teams(\?|$)/.test(url)) return json(route, teams);
      if (req.method() === 'POST' && /\/api\/v1\/teams(\?|$)/.test(url)) {
        const body = req.postDataJSON() as any;
        const team = { id: 't1', _count: { players: 0 }, ...body, logoUrl: body.logoKey ? `/uploads/mock-1.webp` : null, logoThumbUrl: body.logoKey ? `/uploads/mock-1.thumb.webp` : null };
        teams.splice(0, teams.length, team);
        return json(route, team);
      }
      if (req.method() === 'PUT' && /\/api\/v1\/teams\/t1/.test(url)) {
        const body = req.postDataJSON() as any;
        const team = { ...teams[0], ...body, logoUrl: body.logoKey ? `/uploads/mock-${uploadCount}.webp` : null, logoThumbUrl: body.logoKey ? `/uploads/mock-${uploadCount}.thumb.webp` : null };
        teams.splice(0, teams.length, team);
        return json(route, team);
      }
      return json(route, {});
    });

    await page.goto('/teams', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Register Team/i }).click();
    await page.getByLabel('Team name').fill('Test Team');
    await page.getByLabel('Short name').fill('TST');

    // Upload logo (first Choose image button in team form)
    const logoSection = page.locator('div', { has: page.getByText('Team logo', { exact: true }) }).first();
    await logoSection.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(page.getByRole('dialog', { name: /Crop image/i })).toBeVisible();
    await page.getByRole('button', { name: /Use image/i }).click();
    await expect(logoSection.getByText(/Uploading/i)).toHaveCount(0);

    await page.getByRole('button', { name: /Save team/i }).click();
    await expect(page.getByText('Test Team')).toBeVisible();

    await page.getByRole('button', { name: /^Edit$/ }).first().click();
    await page.getByLabel('Coach name').fill('Coach A');
    await page.getByRole('button', { name: /Save team/i }).click();
    await expect(page.getByText(/Coach Coach A/i)).toBeVisible();
  });

  test('registers and edits a player with photo', async ({ page }) => {
    const players: any[] = [];
    let uploadCount = 0;
    await page.route('**/api/v1/uploads', async (route) => {
      uploadCount += 1;
      return json(route, { url: `/uploads/player-${uploadCount}.webp`, thumbUrl: `/uploads/player-${uploadCount}.thumb.webp`, key: `players/photos/player-${uploadCount}.webp`, thumbKey: `players/photos/player-${uploadCount}.thumb.webp` });
    });
    await page.route('**/api/v1/teams**', r => json(r, [{ id: 't1', name: 'Home Team', shortName: 'HOM', primaryColor: '#0ea5e9', textColor: '#fff' }]));
    await page.route('**/api/v1/players**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() === 'GET' && /\/api\/v1\/players(\?|$)/.test(url)) return json(route, players);
      if (req.method() === 'POST' && /\/api\/v1\/players(\?|$)/.test(url)) {
        const body = req.postDataJSON() as any;
        const p = { id: 'p1', ...body, photoUrl: body.photoKey ? `/uploads/player-1.webp` : null, thumbUrl: body.photoKey ? `/uploads/player-1.thumb.webp` : null, team: { id: 't1', name: 'Home Team', primaryColor: '#0ea5e9', textColor: '#fff' } };
        players.splice(0, players.length, p);
        return json(route, p);
      }
      if (req.method() === 'PUT' && /\/api\/v1\/players\/p1/.test(url)) {
        const body = req.postDataJSON() as any;
        const p = { ...players[0], ...body, photoUrl: body.photoKey ? `/uploads/player-${uploadCount}.webp` : (body.photoKey === null ? null : players[0].photoUrl), thumbUrl: body.photoKey ? `/uploads/player-${uploadCount}.thumb.webp` : (body.photoKey === null ? null : players[0].thumbUrl) };
        players.splice(0, players.length, p);
        return json(route, p);
      }
      return json(route, {});
    });

    await page.goto('/players', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Add Player/i }).click();
    await page.getByLabel('First name').fill('Jane');
    await page.getByLabel('Last name').fill('Setter');
    await page.getByLabel('Jersey #').fill('7');

    const photoSection = page.locator('div', { has: page.getByText('Player photo', { exact: true }) }).first();
    await photoSection.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({ name: 'player.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(page.getByRole('dialog', { name: /Crop image/i })).toBeVisible();
    await page.getByRole('button', { name: /Use image/i }).click();

    await page.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('Jane Setter')).toBeVisible();

    await page.getByRole('button', { name: /^Edit/ }).first().click();
    await page.getByRole('button', { name: /Remove/i }).click();
    await page.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('Jane Setter')).toBeVisible();
  });
});

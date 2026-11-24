import { test, expect } from '@playwright/test';

test.describe('Scorebug Designer', () => {
  test('create, apply, export, import, delete theme', async ({ page }) => {
    const matchId = 'm1';
    let themes: any[] = [
      { id: 'builtin-classic', name: 'Classic', description: 'Current Qwesie scorebug look.', config: { schemaVersion: 1, layout: { variant: 'classic', anchor: 'top-left', offsetX: 0, offsetY: 0, scale: 1, safeAreaGuides: false }, shape: { preset: 'slanted', cornerRadius: 0, slantLeft: 14, slantRight: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadow: 'strong', blockGap: 0 }, colors: { background: '#0b101a', teamA: { source: 'team', customBackground: '#0ea5e9', customText: '#ffffff' }, teamB: { source: 'team', customBackground: '#1d4ed8', customText: '#ffffff' }, scoreBackground: '#0f1625', scoreText: '#ffffff', setsBackground: '#1a2233', setsText: '#ffffff', setBadgeBackground: '#e5e7eb', setBadgeText: '#0b101a', servingIndicator: 'currentColor', accent: '#38bdf8', pointFlashA: 'rgba(56,189,248,0.22)', pointFlashB: 'rgba(192,132,252,0.22)', setPointAccent: '#f59e0b', matchPointAccent: '#ef4444', opacity: 1 }, typography: { fontFamily: '"Barlow Condensed", Inter, sans-serif', weight: 800, case: 'upper', letterSpacing: 0.03, nameMax: 40, nameMin: 22, scoreSize: 56, setsSize: 46, labelSize: 32 }, content: { showLogos: true, showTournament: true, tournamentLabel: null, showSetHistory: false, showTimeoutPips: true, showServeIndicator: true, nameDisplay: 'auto', sponsorLogoUrl: null, sponsorSlot: 'none' }, animation: { inOut: 'slide', durationMs: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', scoreChange: 'flip', pointFlash: true } }, isDefault: true, isBuiltIn: true, readOnly: true, version: 1 },
    ];
    let applyCalls: any[] = [];
    let deletedIds: string[] = [];

    const json = (route: any, data: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }) });
    await page.route('**/api/v1/auth/bootstrap-status', route => json(route, { needsBootstrap: false }));
    await page.route('**/api/v1/auth/me', route => json(route, { user: { id: 'u1', username: 'admin', displayName: 'Admin', role: 'ADMIN' } }));
    await page.route('**/api/v1/system/info', route => json(route, { connectedClients: { total: 0, byType: { scorebug: 0, graphics: 0, console: 0, other: 0 } } }));
    await page.route('**/api/v1/matches', route => json(route, [{ id: matchId, status: 'LIVE', court: '1', teams: { A: { name: 'A', shortName: 'A' }, B: { name: 'B', shortName: 'B' } } }]));
    await page.route('**/api/v1/matches/active', route => json(route, { matchId, status: 'LIVE' }));
    await page.route(`**/api/v1/matches/${matchId}`, route => json(route, { id: matchId, status: 'LIVE', court: '1', competitionId: 'c1', teams: { A: { name: 'A', shortName: 'A', score: 0, sets: 0 }, B: { name: 'B', shortName: 'B', score: 0, sets: 0 } }, setHistory: [], current_set: 1 }));

    await page.route('**/api/v1/scorebug-themes**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();
      if (method === 'GET' && /\/scorebug-themes(\?|$)/.test(url)) return json(route, themes);
      if (method === 'POST' && /\/scorebug-themes$/.test(url)) {
        const body = req.postDataJSON() as any;
        const created = { id: `t-${themes.length + 1}`, name: body.name, description: body.description || null, config: body.config, isDefault: false, isBuiltIn: false, readOnly: false, version: 1, competitionId: body.competitionId || null };
        themes = [...themes, created];
        return json(route, created);
      }
      const dup = url.match(/\/scorebug-themes\/([^/]+)\/duplicate$/);
      if (dup && method === 'POST') {
        const src = themes.find(t => t.id === dup[1]);
        const body = req.postDataJSON() as any;
        const created = { ...src, id: `t-dup-${Date.now()}`, name: body?.name || `${src?.name} Copy`, isBuiltIn: false, readOnly: false, version: 1 };
        themes = [...themes, created];
        return json(route, created);
      }
      const del = url.match(/\/scorebug-themes\/([^/]+)$/);
      if (del && method === 'DELETE') {
        deletedIds.push(del[1]);
        themes = themes.filter(t => t.id !== del[1]);
        return json(route, { id: del[1], deleted: true });
      }
      const apply = url.match(/\/scorebug-themes\/match\/([^/]+)\/apply$/);
      if (apply && method === 'POST') {
        const body = req.postDataJSON() as any;
        applyCalls.push({ matchId: apply[1], themeId: body?.themeId });
        return json(route, { id: body?.themeId, source: 'match' });
      }
      return json(route, {});
    });
    await page.route('**/socket.io/**', route => route.abort());

    await page.goto('/design/scorebug', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('scorebug-designer-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Scorebug Designer')).toBeVisible();

    // Create/save as new
    await page.getByRole('button', { name: 'Save as new' }).click();
    await expect.poll(() => themes.some(t => !t.isBuiltIn)).toBeTruthy();

    // Apply to match
    await page.getByPlaceholder('Match id').fill(matchId);
    await page.getByRole('button', { name: 'Apply to this match' }).click();
    await expect.poll(() => applyCalls.length).toBeGreaterThan(0);
    expect(applyCalls[0].matchId).toBe(matchId);

    // Export
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(download.suggestedFilename()).toContain('.json');

    // Import
    const imported = { name: 'Imported Theme', config: themes[0].config };
    await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
      name: 'theme.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)),
    });
    await expect(page.getByText('Imported Theme')).toBeVisible();

    // Delete (select a non-builtin)
    const custom = themes.find(t => !t.isBuiltIn);
    if (custom) {
      page.once('dialog', d => d.accept());
      await page.getByText(custom.name, { exact: true }).first().click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await expect.poll(() => deletedIds.includes(custom.id)).toBeTruthy();
    }
  });
});

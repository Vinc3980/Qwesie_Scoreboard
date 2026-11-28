import { test, expect } from '@playwright/test';

test.describe('Stacked scorebug', () => {
  test('applies stacked preset in designer and checks output', async ({ page }) => {
    const matchId = 'm1';
    const stackedTheme = {
      id: 'builtin-stacked-classic',
      name: 'Stacked Classic',
      description: 'Compact stacked corner scorebug with competition strip.',
      isBuiltIn: true,
      readOnly: true,
      isDefault: false,
      version: 1,
      config: {
        schemaVersion: 1,
        layout: { variant: 'stacked', anchor: 'top-left', offsetX: 0, offsetY: 0, scale: 1, safeAreaGuides: false },
        shape: { preset: 'rounded', cornerRadius: 10, slantLeft: 0, slantRight: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadow: 'strong', blockGap: 0 },
        colors: { background: '#0b101a', teamA: { source: 'team', customBackground: '#0ea5e9', customText: '#ffffff' }, teamB: { source: 'team', customBackground: '#1d4ed8', customText: '#ffffff' }, scoreBackground: '#0f1625', scoreText: '#ffffff', setsBackground: '#1a2233', setsText: '#ffffff', setBadgeBackground: '#e5e7eb', setBadgeText: '#0b101a', servingIndicator: 'currentColor', accent: '#38bdf8', pointFlashA: 'rgba(56,189,248,0.22)', pointFlashB: 'rgba(192,132,252,0.22)', setPointAccent: '#f59e0b', matchPointAccent: '#ef4444', opacity: 1 },
        typography: { fontFamily: '"Barlow Condensed", Inter, sans-serif', weight: 800, case: 'upper', letterSpacing: 0.03, nameMax: 40, nameMin: 22, scoreSize: 56, setsSize: 46, labelSize: 32 },
        content: { showLogos: true, showTournament: true, tournamentLabel: null, showSetHistory: false, showTimeoutPips: true, showServeIndicator: true, nameDisplay: 'auto', sponsorLogoUrl: null, sponsorSlot: 'none' },
        animation: { inOut: 'slide', durationMs: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', scoreChange: 'flip', pointFlash: true },
        stacked: { rowHeight: 52, width: 380, infoStripPosition: 'below', showCompetitionLogo: true, showCompetitionName: true, showSetLabel: true, showRound: false, showMatchNumber: false, showCourt: false, previousSets: 'pips', serveIndicator: 'dot', teamNameStyle: 'short', logoSize: 34, logoShape: 'rounded', teamAccent: 'bar', textAlign: 'left', anchorCorner: 'top-left', compactness: 'standard', expandStripOnSetBreak: true },
      },
    };
    const themes: any[] = [
      { id: 'builtin-classic', name: 'Classic', description: 'Current Qwesie scorebug look.', config: { ...stacked.config, layout: { ...stacked.config.layout, variant: 'classic' } }, isDefault: true, isBuiltIn: true, readOnly: true, version: 1 },
      stackedTheme,
    ];
    const applyCalls: any[] = [];

    const json = (route: any, data: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }) });
    await page.route('**/api/v1/auth/bootstrap-status', route => json(route, { needsBootstrap: false }));
    await page.route('**/api/v1/auth/me', route => json(route, { user: { id: 'u1', username: 'admin', displayName: 'Admin', role: 'ADMIN' } }));
    await page.route('**/api/v1/system/info', route => json(route, { connectedClients: { total: 0, byType: { scorebug: 0, graphics: 0, console: 0, other: 0 } } }));
    await page.route('**/api/v1/matches', route => json(route, [{ id: matchId, status: 'LIVE', court: '1', teams: { A: { name: 'A', shortName: 'A' }, B: { name: 'B', shortName: 'B' } } }]));
    await page.route('**/api/v1/matches/active', route => json(route, { matchId, status: 'LIVE' }));
    await page.route(`**/api/v1/matches/${matchId}`, route => json(route, { id: matchId, status: 'LIVE', court: '1', competitionId: 'c1', competitionName: 'National League', tournament: 'National League', teams: { A: { name: 'A', shortName: 'A', score: 0, sets: 0 }, B: { name: 'B', shortName: 'B', score: 0, sets: 0 } }, setHistory: [], current_set: 1, max_sets: 5, flags: {} }));
    await page.route('**/api/v1/scorebug-themes**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();
      if (method === 'GET' && /\/scorebug-themes(\?|$)/.test(url)) return json(route, themes);
      const apply = url.match(/\/scorebug-themes\/match\/([^/]+)\/apply$/);
      if (apply && method === 'POST') {
        const body = req.postDataJSON() as any;
        applyCalls.push({ matchId: apply[1], themeId: body?.themeId });
        return json(route, { id: body?.themeId, source: 'match' });
      }
      if (method === 'POST' && /\/scorebug-themes$/.test(url)) {
        const body = req.postDataJSON() as any;
        const created = { id: `t-${themes.length + 1}`, ...body, isBuiltIn: false, readOnly: false, version: 1 };
        themes.push(created);
        return json(route, created);
      }
      return json(route, {});
    });
    await page.route('**/socket.io/**', route => route.abort());

    await page.goto('/design/scorebug', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('scorebug-designer-page')).toBeVisible({ timeout: 15000 });
    await page.getByText('Stacked Classic', { exact: true }).first().click();
    await expect(page.getByTestId('scorebug-stacked')).toBeVisible();
    await expect(page.getByTestId('scorebug-stacked')).toContainText('NATIONAL LEAGUE');
    await expect(page.getByTestId('scorebug-stacked')).toContainText('SET 1');

    await page.getByPlaceholder('Match id').fill(matchId);
    await page.getByRole('button', { name: 'Apply to this match' }).click();
    await expect.poll(() => applyCalls.length).toBeGreaterThan(0);
    expect(applyCalls[0].themeId).toBe('builtin-stacked-classic');
  });
});

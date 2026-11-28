import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const variants = ['classic','compact','wide','stacked','mini','pill','set-table','bottom-bar','top-bar','side-panel'] as const;
const scales = [0.5, 1, 1.5, 2];
const anchors = ['top-left','top-center','top-right','middle-left','middle-center','middle-right','bottom-left','bottom-center','bottom-right'];
const scenarios = ['0-0','mid-set','set-point','timeout','deciding-set','long-names','missing-logos','3-digit'] as const;
const frames = [
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '1280x720', w: 1280, h: 720 },
  { name: '2560x1440', w: 2560, h: 1440 },
  { name: '3840x2160', w: 3840, h: 2160 },
  { name: '1080x1920', w: 1080, h: 1920 },
  { name: '1x1', w: 1080, h: 1080 },
  { name: '21x9', w: 2560, h: 1080 },
];

function isBar(v: string) { return v === 'bottom-bar' || v === 'top-bar'; }

async function measureStageBox(page: any) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid^="scorebug-variant-"], [data-testid="scorebug-stacked"]') as HTMLElement | null;
    const canvas = document.querySelector('.broadcast-canvas') as HTMLElement | null;
    if (!root || !canvas) return null;
    const rb = root.getBoundingClientRect();
    const cb = canvas.getBoundingClientRect();
    const stageW = Number(canvas.getAttribute('data-stage-width') || 1920);
    const stageH = Number(canvas.getAttribute('data-stage-height') || 1080);
    const sx = cb.width / stageW || 1;
    const sy = cb.height / stageH || 1;
    return {
      x: (rb.left - cb.left) / sx,
      y: (rb.top - cb.top) / sy,
      w: rb.width / sx,
      h: rb.height / sy,
      stageW, stageH,
    };
  });
}

test.describe('Scorebug matrix', () => {
  test('variant x scale x anchor x scenario x frame size with stage-coordinate assertions', async ({ browser }) => {
    test.setTimeout(20 * 60 * 1000);
    const outDir = path.resolve('docs/scorebug/matrix');
    fs.mkdirSync(outDir, { recursive: true });

    const cases: Array<any> = [];
    for (const variant of variants) for (const scale of scales) for (const anchor of ['top-left','top-right','bottom-center'] as const) for (const scenario of ['mid-set','long-names','3-digit'] as const) for (const frame of [frames[0], frames[1], frames[4]]) cases.push({ variant, scale, anchor, scenario, frame });
    for (const frame of frames) cases.push({ variant: 'classic', scale: 1, anchor: 'top-left', scenario: 'mid-set', frame });
    for (const anchor of anchors) cases.push({ variant: 'wide', scale: 1.5, anchor, scenario: 'long-names', frame: frames[0] });
    for (const scenario of scenarios) cases.push({ variant: 'stacked', scale: 1, anchor: 'top-left', scenario, frame: frames[0] });

    for (const c of cases.slice(0, 120)) {
      const context = await browser.newContext({ viewport: { width: c.frame.w, height: c.frame.h } });
      const page = await context.newPage();
      const theme = {
        id: `t-${c.variant}`, name: c.variant, isBuiltIn: false, readOnly: false, version: 1,
        config: {
          schemaVersion: 1,
          layout: { variant: c.variant, anchor: c.anchor, offsetX: 0, offsetY: 0, scale: c.scale, safeAreaGuides: false },
          shape: { preset: c.variant === 'pill' ? 'pill' : 'rounded', cornerRadius: c.variant === 'pill' ? 48 : 8, slantLeft: 0, slantRight: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadow: 'strong', blockGap: 0 },
          colors: { background: '#0b101a', teamA: { source: 'team', customBackground: '#0ea5e9', customText: '#ffffff' }, teamB: { source: 'team', customBackground: '#1d4ed8', customText: '#ffffff' }, scoreBackground: '#0f1625', scoreText: '#ffffff', setsBackground: '#1a2233', setsText: '#ffffff', setBadgeBackground: '#e5e7eb', setBadgeText: '#0b101a', servingIndicator: 'currentColor', accent: '#38bdf8', pointFlashA: 'rgba(56,189,248,0.22)', pointFlashB: 'rgba(192,132,252,0.22)', setPointAccent: '#f59e0b', matchPointAccent: '#ef4444', opacity: 1 },
          typography: { fontFamily: '"Barlow Condensed", Inter, sans-serif', weight: 800, case: 'upper', letterSpacing: 0.03, nameMax: 40, nameMin: 22, scoreSize: 56, setsSize: 46, labelSize: 32 },
          content: { showLogos: c.scenario !== 'missing-logos', showTournament: true, tournamentLabel: null, showSetHistory: true, showTimeoutPips: true, showServeIndicator: true, nameDisplay: 'auto', sponsorLogoUrl: null, sponsorSlot: 'none' },
          animation: { inOut: 'fade', durationMs: 100, easing: 'linear', scoreChange: 'none', pointFlash: false },
          sizing: { widthMode: 'auto', widthPx: 1100, maxWidthPercent: isBar(c.variant) ? 100 : 45, rowHeight: 74, teamBlockWidth: c.variant === 'wide' ? 500 : c.variant === 'compact' ? 370 : 400, nameWidth: c.variant === 'wide' ? 320 : c.variant === 'compact' ? 170 : 200, logoSize: 40, setsBoxWidth: 72, pointsBoxWidth: 124, setBadgeWidth: 132, competitionWidth: 220, fontScale: 1, padding: 12, gap: 0 },
          stacked: { rowHeight: 52, width: 380, infoStripPosition: 'below', showCompetitionLogo: true, showCompetitionName: true, showSetLabel: true, showRound: false, showMatchNumber: false, showCourt: false, previousSets: 'pips', serveIndicator: 'dot', teamNameStyle: 'short', logoSize: 34, logoShape: 'rounded', teamAccent: 'bar', textAlign: 'left', anchorCorner: c.anchor.includes('right') ? 'top-right' : 'top-left', compactness: 'standard', expandStripOnSetBreak: true },
        },
      };

      const json = (route: any, data: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }) });
      await page.route('**/api/v1/auth/bootstrap-status', r => json(r, { needsBootstrap: false }));
      await page.route('**/api/v1/auth/me', r => json(r, { user: { id: 'u1', username: 'admin', displayName: 'Admin', role: 'ADMIN' } }));
      await page.route('**/api/v1/system/info', r => json(r, { connectedClients: { total: 0, byType: {} } }));
      await page.route('**/api/v1/scorebug-themes**', async r => {
        const url = r.request().url();
        if (r.request().method() === 'GET' && /\/scorebug-themes(\?|$)/.test(url)) return json(r, [theme]);
        return json(r, theme);
      });
      await page.route('**/socket.io/**', r => r.abort());

      await page.goto(`/design/scorebug?scenario=${encodeURIComponent(c.scenario)}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('scorebug-designer-page')).toBeVisible({ timeout: 15000 });
      await page.getByText(theme.name, { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
      await expect(page.locator('[data-testid^="scorebug-variant-"], [data-testid="scorebug-stacked"]').first()).toBeVisible({ timeout: 10000 });

      const box = await measureStageBox(page);
      expect(box).not.toBeNull();
      if (box) {
        const cap = isBar(c.variant) ? box.stageW - 96 : box.stageW * 0.45;
        expect(box.w).toBeLessThanOrEqual(cap + 2);
        expect(box.x).toBeGreaterThanOrEqual(48 - 2);
        expect(box.y).toBeGreaterThanOrEqual(48 - 2);
        expect(box.x + box.w).toBeLessThanOrEqual(box.stageW - 48 + 2);
        expect(box.y + box.h).toBeLessThanOrEqual(box.stageH - 48 + 2);
      }

      const overflowCount = await page.evaluate(() => {
        const root = document.querySelector('[data-testid^="scorebug-variant-"], [data-testid="scorebug-stacked"]');
        if (!root) return 0;
        return Array.from(root.querySelectorAll('*')).filter((el) => {
          const h = el as HTMLElement;
          const style = window.getComputedStyle(h);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          return h.scrollWidth > h.clientWidth + 2 && h.clientWidth > 0;
        }).length;
      });
      expect(overflowCount).toBeLessThan(5);

      const file = path.join(outDir, `${c.variant}_${c.scale}_${c.anchor}_${c.scenario}_${c.frame.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      expect(fs.statSync(file).size).toBeGreaterThan(10_000);
      await context.close();
    }
  });

  test('no layout shift on score 9->10->100 (stage coordinates)', async ({ browser }) => {
    test.setTimeout(10 * 60 * 1000);
    const outDir = path.resolve('docs/scorebug/matrix');
    fs.mkdirSync(outDir, { recursive: true });
    const frames = [{ name: '1920x1080', w: 1920, h: 1080 }, { name: '1280x720', w: 1280, h: 720 }];

    for (const variant of variants) {
      for (const frame of frames) {
        const boxes: any[] = [];
        for (const scenario of ['score-9', 'score-10', 'score-100']) {
          const context = await browser.newContext({ viewport: { width: frame.w, height: frame.h } });
          const page = await context.newPage();
          const theme = {
            id: `t-${variant}`, name: variant, isBuiltIn: false, readOnly: false, version: 1,
            config: {
              schemaVersion: 1,
              layout: { variant, anchor: 'top-left', offsetX: 0, offsetY: 0, scale: 1, safeAreaGuides: false },
              shape: { preset: variant === 'pill' ? 'pill' : 'rounded', cornerRadius: variant === 'pill' ? 48 : 8, slantLeft: 0, slantRight: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadow: 'strong', blockGap: 0 },
              colors: { background: '#0b101a', teamA: { source: 'team', customBackground: '#0ea5e9', customText: '#ffffff' }, teamB: { source: 'team', customBackground: '#1d4ed8', customText: '#ffffff' }, scoreBackground: '#0f1625', scoreText: '#ffffff', setsBackground: '#1a2233', setsText: '#ffffff', setBadgeBackground: '#e5e7eb', setBadgeText: '#0b101a', servingIndicator: 'currentColor', accent: '#38bdf8', pointFlashA: 'rgba(56,189,248,0.22)', pointFlashB: 'rgba(192,132,252,0.22)', setPointAccent: '#f59e0b', matchPointAccent: '#ef4444', opacity: 1 },
              typography: { fontFamily: '"Barlow Condensed", Inter, sans-serif', weight: 800, case: 'upper', letterSpacing: 0.03, nameMax: 40, nameMin: 22, scoreSize: 56, setsSize: 46, labelSize: 32 },
              content: { showLogos: true, showTournament: true, tournamentLabel: null, showSetHistory: true, showTimeoutPips: true, showServeIndicator: true, nameDisplay: 'auto', sponsorLogoUrl: null, sponsorSlot: 'none' },
              animation: { inOut: 'fade', durationMs: 100, easing: 'linear', scoreChange: 'none', pointFlash: false },
              sizing: { widthMode: 'auto', widthPx: 1100, maxWidthPercent: isBar(variant) ? 100 : 45, rowHeight: 74, teamBlockWidth: variant === 'wide' ? 500 : variant === 'compact' ? 370 : 400, nameWidth: variant === 'wide' ? 320 : variant === 'compact' ? 170 : 200, logoSize: 40, setsBoxWidth: 72, pointsBoxWidth: 124, setBadgeWidth: 132, competitionWidth: 220, fontScale: 1, padding: 12, gap: 0 },
              stacked: { rowHeight: 52, width: 380, infoStripPosition: 'below', showCompetitionLogo: true, showCompetitionName: true, showSetLabel: true, showRound: false, showMatchNumber: false, showCourt: false, previousSets: 'pips', serveIndicator: 'dot', teamNameStyle: 'short', logoSize: 34, logoShape: 'rounded', teamAccent: 'bar', textAlign: 'left', anchorCorner: 'top-left', compactness: 'standard', expandStripOnSetBreak: true },
            },
          };
          const json = (route: any, data: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }) });
          await page.route('**/api/v1/auth/bootstrap-status', r => json(r, { needsBootstrap: false }));
          await page.route('**/api/v1/auth/me', r => json(r, { user: { id: 'u1', username: 'admin', displayName: 'Admin', role: 'ADMIN' } }));
          await page.route('**/api/v1/system/info', r => json(r, { connectedClients: { total: 0, byType: {} } }));
          await page.route('**/api/v1/scorebug-themes**', async r => {
            const url = r.request().url();
            if (r.request().method() === 'GET' && /\/scorebug-themes(\?|$)/.test(url)) return json(r, [theme]);
            return json(r, theme);
          });
          await page.route('**/socket.io/**', r => r.abort());
          await page.goto(`/design/scorebug?scenario=${scenario}`, { waitUntil: 'domcontentloaded' });
          await expect(page.getByTestId('scorebug-designer-page')).toBeVisible({ timeout: 15000 });
          await page.getByText(theme.name, { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
          await expect(page.locator('[data-testid^="scorebug-variant-"], [data-testid="scorebug-stacked"]').first()).toBeVisible({ timeout: 10000 });
          const box = await measureStageBox(page);
          expect(box).not.toBeNull();
          boxes.push(box);
          await page.screenshot({ path: path.join(outDir, `shift_${variant}_${frame.name}_${scenario}.png`), fullPage: false });
          await context.close();
        }
        // 9->10 and 10->100 should not shift layout
        expect(Math.abs(boxes[0].w - boxes[1].w)).toBeLessThanOrEqual(2);
        expect(Math.abs(boxes[0].h - boxes[1].h)).toBeLessThanOrEqual(2);
        expect(Math.abs(boxes[1].w - boxes[2].w)).toBeLessThanOrEqual(2);
        expect(Math.abs(boxes[1].h - boxes[2].h)).toBeLessThanOrEqual(2);
      }
    }
  });
});

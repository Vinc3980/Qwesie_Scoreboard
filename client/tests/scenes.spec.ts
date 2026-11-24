import { test, expect } from '@playwright/test';

const scenes = [
  'SET_BREAK',
  'TIMEOUT',
  'MATCH_STATS',
  'LINEUPS',
  'HEAD_TO_HEAD',
  'PLAYER_SPOTLIGHT',
  'MATCH_MOMENTUM',
  'FINAL',
  'BREAK_SLATE',
];

const sceneScenarios: Record<string, string[]> = {
  SET_BREAK: ['setbreak', 'empty'],
  TIMEOUT: ['timeout', 'empty'],
  MATCH_STATS: ['normal', 'empty'],
  LINEUPS: ['normal', 'empty'],
  HEAD_TO_HEAD: ['normal', 'empty'],
  PLAYER_SPOTLIGHT: ['normal', 'empty'],
  MATCH_MOMENTUM: ['momentum', 'empty'],
  FINAL: ['final', 'empty'],
  BREAK_SLATE: ['normal', 'empty'],
};

for (const scene of scenes) {
  for (const scenario of sceneScenarios[scene] || ['normal']) {
    test(`scene ${scene.toLowerCase()} ${scenario}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addStyleTag({
        content: `*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;transition-delay:0s !important;scroll-behavior:auto !important;caret-color:transparent !important;}`,
      });

      const qs = new URLSearchParams({ preview: '1', scene, scenario });
      await page.goto(`/broadcast/preview/graphics?${qs.toString()}`, { waitUntil: 'networkidle' });

      // wait for scene-specific heading or stable content
      const title = scene.replace(/_/g, ' ');
      await expect(page.getByText(new RegExp(title.split(' ').slice(0, 2).join('|'), 'i')).first()).toBeVisible({ timeout: 15000 }).catch(() => {});

      await page.evaluate(async () => {
        // @ts-ignore
        if (document.fonts?.ready) await document.fonts.ready;
      });
      await page.waitForTimeout(350);

      await expect(page).toHaveScreenshot(`scene-${scene.toLowerCase()}-${scenario}-${testInfo.project.name}.png`, {
        fullPage: false,
        animations: 'disabled',
      });
    });
  }
}

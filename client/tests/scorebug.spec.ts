import { test, expect } from '@playwright/test';

const scenarios: Array<{ name: string; scenario: string; options?: string }> = [
  { name: 'normal-play', scenario: 'normal' },
  { name: 'set-point', scenario: 'setpoint' },
  { name: 'match-point', scenario: 'matchpoint' },
  { name: 'timeout', scenario: 'timeout' },
  { name: 'set-won', scenario: 'setwon' },
  { name: 'long-team-names', scenario: 'longnames' },
  { name: 'similar-team-colors', scenario: 'similarcolors' },
  { name: 'missing-logo', scenario: 'missinglogo' },
  { name: '25plus-point-scores', scenario: 'highscores' },
];

for (const { name, scenario, options } of scenarios) {
  test(`scorebug ${name}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addStyleTag({
      content: `*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;transition-delay:0s !important;scroll-behavior:auto !important;caret-color:transparent !important;}`,
    });

    const qs = new URLSearchParams({ scenario, preview: '1', variant: 'classic', sets: '1' });
    if (options) {
      for (const [k, v] of new URLSearchParams(options)) qs.set(k, v);
    }

    await page.goto(`/broadcast/preview/scorebug?${qs.toString()}`, { waitUntil: 'networkidle' });

    // Wait for scorebug bar to render
    const bar = page.getByText(/SET\s+\d/).first();
    await expect(bar).toBeVisible({ timeout: 15000 });

    // Allow fonts/layout to settle and ensure no transient cursor/focus artifacts
    await page.evaluate(async () => {
      // @ts-ignore
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await page.waitForTimeout(250);

    await expect(page).toHaveScreenshot(`${name}-${testInfo.project.name}.png`, {
      fullPage: false,
      animations: 'disabled',
    });
  });
}

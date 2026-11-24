import { test, expect } from '@playwright/test';

test('Classic scorebug renders with expected default styling (visual baseline)', async ({ page }) => {
  await page.route('**/socket.io/**', route => route.abort());
  await page.goto('/overlay/scorebug?demo=1&scenario=normal&bg=checker', { waitUntil: 'networkidle' });
  const stage = page.locator('div').filter({ hasText: 'SAMPLE DATA' }).first();
  await expect(page.getByText('SAMPLE DATA')).toBeVisible({ timeout: 15000 });
  // Visual regression baseline for Classic theme.
  await expect(page).toHaveScreenshot('scorebug-classic.png', { maxDiffPixelRatio: 0.02, fullPage: false });
});

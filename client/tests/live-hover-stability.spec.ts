import { test, expect } from '@playwright/test';

/**
 * Stage H2 / Bug 4: hover stability for live control buttons.
 * Env-gated because it requires a running live console with a match context.
 * Set BASE_MATCH_ID (and run against a live backend+frontend) to execute.
 * Not executed automatically in this workspace.
 */
test.describe('Live control hover stability (env-gated)', () => {
  const matchId = process.env.BASE_MATCH_ID;
  test.skip(!matchId, 'Set BASE_MATCH_ID to run hover stability check on /live/:id');

  test('hovering a score button for 3s keeps same node and stable box/style', async ({ page, baseURL }) => {
    test.setTimeout(60_000);
    await page.goto(`${baseURL}/live/${matchId}`, { waitUntil: 'networkidle' });
    const btn = page.getByRole('button', { name: '+1' }).first();
    await expect(btn).toBeVisible({ timeout: 20000 });

    const before = await btn.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      return {
        x: r.x, y: r.y, w: r.width, h: r.height,
        transform: cs.transform,
        opacity: cs.opacity,
        color: cs.color,
        bg: cs.backgroundColor,
        borderWidth: cs.borderTopWidth,
        padding: cs.paddingTop,
      };
    });

    await btn.hover();
    await page.waitForTimeout(3000);

    const after = await btn.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      return {
        connected: el.isConnected,
        x: r.x, y: r.y, w: r.width, h: r.height,
        transform: cs.transform,
        opacity: cs.opacity,
        color: cs.color,
        bg: cs.backgroundColor,
        borderWidth: cs.borderTopWidth,
        padding: cs.paddingTop,
      };
    });

    // Same DOM node remains connected and geometry/layout-affecting properties stay stable.
    expect(after.connected).toBe(true);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(after.w).toBeCloseTo(before.w, 0);
    expect(after.h).toBeCloseTo(before.h, 0);
    expect(after.transform).toBe(before.transform);
    expect(after.borderWidth).toBe(before.borderWidth);
    expect(after.padding).toBe(before.padding);
    // Hover may intentionally change color/background; do not assert them equal.
  });
});

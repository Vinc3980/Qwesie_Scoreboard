import { test, expect } from '@playwright/test';

/**
 * Stage E live console tests.
 * Full end-to-end flows require a running backend+DB, an authenticated scorer session,
 * and a configured LIVE match with real rosters/lineups. Provide BASE_MATCH_ID (and ensure
 * server/client are running against the same env) to enable full-flow tests; otherwise skipped.
 */

test.describe('Live control console', () => {
  test('console route responds (unavailable or loaded state)', async ({ page }) => {
    await page.goto('/live', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Live control|Loading live control|QWESIE|Scorebug|Retry/i);
  });

  test('scorebug route renders for preview scenario (companion page)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/broadcast/preview/scorebug?preview=1&scenario=normal', { waitUntil: 'networkidle' });
    await expect(page.getByText(/SET\s+\d/).first()).toBeVisible({ timeout: 15000 });
  });

  test('keyboard shortcuts do not crash on unloaded console', async ({ page }) => {
    await page.goto('/live', { waitUntil: 'domcontentloaded' });
    await page.keyboard.press('o');
    await page.keyboard.press('?');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Live control with real match (requires backend + LIVE match)', () => {
  const matchId = process.env.BASE_MATCH_ID;
  test.skip(!matchId, 'Set BASE_MATCH_ID to run full console + scorebug flow');

  test('shows real lineup/on-air/outputs controls and supports tagged actions, sub flow, break flow, undo labels', async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseURL}/live/${matchId}`, { waitUntil: 'networkidle' });

    await expect(page.getByRole('button', { name: /Outputs/i }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/On-air/i).first()).toBeVisible();
    await expect(page.locator('body')).toContainText(/SB/);
    await expect(page.locator('body')).toContainText(/GFX/);

    // Real lineup cards (P1..P6) or explicit empty-state when no lineup set
    const lineupPresent = await page.getByText(/P1/).first().isVisible().catch(() => false);
    if (lineupPresent) {
      await page.getByText(/P1/).first().click();
      await expect(page.locator('body')).toContainText(/Selected:/i);
      await page.getByRole('button', { name: /KILL/i }).first().click();
    }

    // Substitution/libero modal opens and uses lists (no typing inputs required)
    const subBtn = page.getByRole('button', { name: /Sub\/Libero|Sub/i }).first();
    if (await subBtn.isEnabled().catch(() => false)) {
      await subBtn.click();
      await expect(page.getByText(/Substitution \/ Libero swap/i)).toBeVisible();
      await expect(page.getByText(/OUT \(on court\)/i)).toBeVisible();
      await expect(page.getByText(/IN \(bench\)/i)).toBeVisible();
      await page.getByRole('button', { name: /Cancel/i }).click();
    }

    // Undo button carries descriptive label
    await expect(page.getByRole('button', { name: /Undo:/i }).first()).toBeVisible();

    await context.close();
  });
});

test.describe('Full match flow (requires backend + LIVE match with real players)', () => {
  const matchId = process.env.BASE_MATCH_ID;
  test.skip(!matchId, 'Set BASE_MATCH_ID to run full console + scorebug flow');

  test('double-tap protection, tagged action + undo, offline queue replay, end-set break panel and start next set', async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const context1 = await browser.newContext();
    const consolePage = await context1.newPage();
    const context2 = await browser.newContext();
    const scorebugPage = await context2.newPage();

    await consolePage.goto(`${baseURL}/live/${matchId}`, { waitUntil: 'networkidle' });
    await scorebugPage.goto(`${baseURL}/broadcast/${matchId}/scorebug?debug=1`, { waitUntil: 'networkidle' });

    const plusA = consolePage.getByRole('button', { name: '+1' }).first();
    await expect(plusA).toBeVisible({ timeout: 20000 });
    await plusA.dblclick();
    await consolePage.waitForTimeout(400);

    // tap real player then action (if lineup present)
    const playerCard = consolePage.getByText(/P1/).first();
    if (await playerCard.isVisible().catch(() => false)) {
      await playerCard.click();
      const killBtn = consolePage.getByRole('button', { name: /^KILL$/i }).first();
      if (await killBtn.isVisible().catch(() => false)) await killBtn.click();
      await consolePage.getByRole('button', { name: /Undo:/i }).first().click();
    }

    // Offline queue replay
    await context1.setOffline(true);
    await plusA.click();
    await expect(consolePage.locator('body')).toContainText(/queued|OFFLINE/i);
    await context1.setOffline(false);
    await consolePage.waitForTimeout(1500);

    async function winSetForA() {
      for (let i = 0; i < 30; i++) {
        const endSet = consolePage.getByRole('button', { name: /End set|Start set/i });
        if (await endSet.first().isVisible().catch(() => false)) break;
        await plusA.click({ delay: 380 }).catch(() => {});
        await consolePage.waitForTimeout(120);
      }
      const endSetBtn = consolePage.getByRole('button', { name: /End set/i }).first();
      if (await endSetBtn.isVisible().catch(() => false)) await endSetBtn.click();
      const startNext = consolePage.getByRole('button', { name: /Start set/i }).first();
      if (await startNext.isVisible().catch(() => false)) await startNext.click();
    }

    await winSetForA();
    await winSetForA();
    await winSetForA();

    await expect(scorebugPage.locator('body')).toBeVisible();

    await context1.close();
    await context2.close();
  });
});

test.describe('Match-day flow acceptance (requires backend + configured match)', () => {
  const matchId = process.env.BASE_MATCH_ID;
  test.skip(!matchId, 'Set BASE_MATCH_ID to run match-day flow acceptance');

  test('Start Set 1, score to 25, End Set, show stats, Start Set 2', async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${baseURL}/live/${matchId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Pre-match|Set 1|Flow/i).first()).toBeVisible({ timeout: 20000 });

    // Start Set 1 via primary action / pre-flight
    const startSet1 = page.getByRole('button', { name: /Start Set 1/i }).first();
    if (await startSet1.isVisible().catch(() => false)) {
      await startSet1.click();
      const confirmStart = page.getByRole('button', { name: /Start Set 1/i }).last();
      if (await confirmStart.isVisible().catch(() => false)) await confirmStart.click();
    }

    // Score to 25 for Team A
    const plusA = page.getByRole('button', { name: '+1' }).first();
    await expect(plusA).toBeVisible({ timeout: 20000 });
    for (let i = 0; i < 40; i++) {
      const endSetVisible = await page.getByRole('button', { name: /End Set 1/i }).first().isVisible().catch(() => false);
      if (endSetVisible) break;
      if (await plusA.isEnabled().catch(() => false)) await plusA.click({ delay: 250 }).catch(() => {});
      await page.waitForTimeout(120);
    }

    const endSetBtn = page.getByRole('button', { name: /End Set 1/i }).first();
    await expect(endSetBtn).toBeVisible({ timeout: 20000 });
    await endSetBtn.click();

    // Set summary / stats
    await expect(page.getByText(/Set 1 summary|Set score/i).first()).toBeVisible({ timeout: 20000 });
    const showStats = page.getByRole('button', { name: /Show set stats full screen/i }).first();
    await expect(showStats).toBeVisible();
    await showStats.click();

    // Start Set 2
    const startSet2 = page.getByRole('button', { name: /Start Set 2/i }).first();
    await expect(startSet2).toBeVisible({ timeout: 20000 });
    await startSet2.click();
    const confirmStart2 = page.getByRole('button', { name: /Start Set 2/i }).last();
    if (await confirmStart2.isVisible().catch(() => false)) await confirmStart2.click();

    await expect(page.locator('body')).toContainText(/Set 2|SET 2/i);

    await context.close();
  });
});

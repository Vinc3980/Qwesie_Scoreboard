import { test, expect } from '@playwright/test';

/**
 * Stage B end-to-end setup tests require running backend+DB, seeded/auth context as applicable,
 * and the built/dev client reachable at baseURL. Enable by setting STAGEB_E2E=1.
 */
const enabled = process.env.STAGEB_E2E === '1';

test.describe('Stage B - match setup wizard and registry', () => {
  test.skip(!enabled, 'Set STAGEB_E2E=1 with backend+DB running to execute Stage B flows');

  test('create two teams, paste 12 players each, pick starting six, go live', async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    const ts = Date.now();
    const teamA = `E2E HOME ${ts}`;
    const teamB = `E2E AWAY ${ts}`;

    // Create Team A
    await page.goto(`${baseURL}/teams`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Register Team/i }).click();
    await page.getByLabel(/Team name/i).fill(teamA);
    await page.getByLabel(/Short name/i).fill('EHA');
    await page.getByRole('button', { name: /^Save team$/i }).click();
    await expect(page.getByText(teamA)).toBeVisible({ timeout: 15000 });

    // Create Team B
    await page.getByRole('button', { name: /Register Team/i }).click();
    await page.getByLabel(/Team name/i).fill(teamB);
    await page.getByLabel(/Short name/i).fill('EAB');
    await page.getByRole('button', { name: /^Save team$/i }).click();
    await expect(page.getByText(teamB)).toBeVisible({ timeout: 15000 });

    // Paste 12 players for Team A (select it)
    await page.getByRole('button', { name: /Edit/i }).first().click();
    const pasteBoxA = page.getByPlaceholder(/7, K\. Mensah, OH/i).first();
    const roster12 = Array.from({ length: 12 }, (_, i) => `${i + 1}, Player A${i + 1}, ${['OH','MB','S','OPP','OH','MB','OH','S','DS','MB','OPP','L'][i]}`).join('\n');
    await pasteBoxA.fill(roster12);
    await page.getByRole('button', { name: /Import players/i }).click();
    await expect(page.getByText(/Created|Bulk/i)).toBeVisible({ timeout: 15000 });

    // Paste 12 players for Team B (edit second team card context - open by clicking Edit on its row)
    await page.getByText(teamB).first().click().catch(() => {});
    const editButtons = page.getByRole('button', { name: /Edit/i });
    await editButtons.nth(1).click();
    const pasteBoxB = page.getByPlaceholder(/7, K\. Mensah, OH/i).first();
    const roster12b = Array.from({ length: 12 }, (_, i) => `${i + 1}, Player B${i + 1}, ${['OH','MB','S','OPP','OH','MB','OH','S','DS','MB','OPP','L'][i]}`).join('\n');
    await pasteBoxB.fill(roster12b);
    await page.getByRole('button', { name: /Import players/i }).click();

    // New match wizard
    await page.goto(`${baseURL}/matches/new`, { waitUntil: 'networkidle' });
    // Step 1 save/next
    await page.getByRole('button', { name: /Next/i }).click();
    // Step 2 teams
    await page.getByLabel(/Home team/i).selectOption({ label: new RegExp(teamA) }).catch(async () => {
      await page.locator('select').first().selectOption({ index: 1 });
    });
    await page.getByLabel(/Away team/i).selectOption({ index: 2 }).catch(async () => {
      const selects = page.locator('select');
      await selects.nth(1).selectOption({ index: 2 });
    });
    await page.getByRole('button', { name: /Next/i }).click();

    // Step 3 rosters: prefill from team and save
    await page.getByRole('button', { name: /Pre-fill from team/i }).first().click();
    await page.getByRole('button', { name: /^Save roster$/i }).first().click();
    await page.getByRole('button', { name: /Pre-fill from team/i }).nth(1).click();
    await page.getByRole('button', { name: /^Save roster$/i }).nth(1).click();
    await page.getByRole('button', { name: /Next/i }).click();

    // Step 4 starting six: use same-as-last-set helpers if available or tap-assign first 6
    const sameButtons = page.getByRole('button', { name: /Same as last set/i });
    if (await sameButtons.count() >= 2) {
      await sameButtons.nth(0).click();
      await sameButtons.nth(1).click();
    } else {
      // fallback: click positions and players
      const posButtons = page.getByRole('button', { name: /Tap to assign|POS/i });
      for (let i = 0; i < Math.min(6, await posButtons.count()); i++) await posButtons.nth(i).click();
    }
    await page.getByRole('button', { name: /^Save lineup$/i }).first().click().catch(()=>{});
    await page.getByRole('button', { name: /^Save lineup$/i }).nth(1).click().catch(()=>{});
    await page.getByRole('button', { name: /Next/i }).click();

    // Step 5 review and go live
    await expect(page.getByText(/Review & go live/i)).toBeVisible();
    await page.getByRole('button', { name: /^Go live$/i }).click();
    await expect(page).toHaveURL(/\/live\//, { timeout: 20000 });
  });

  test('keyboard-only roster entry (20 players)', async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    await page.goto(`${baseURL}/matches/new`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^2\. Teams$/i }).click().catch(()=>{});
    await page.getByRole('button', { name: /^3\. Rosters$/i }).click().catch(()=>{});
    // focus first jersey input and enter 20 players using keyboard (jersey -> Tab -> name -> Tab -> pos -> Enter adds next row)
    const firstJersey = page.locator('input[data-col="jersey"]').first();
    await firstJersey.click();
    for (let i = 1; i <= 20; i++) {
      await page.keyboard.type(String(i));
      await page.keyboard.press('Tab');
      await page.keyboard.type(`Keyboard Player ${i}`);
      await page.keyboard.press('Tab');
      await page.keyboard.type('OH');
      await page.keyboard.press('Enter');
    }
    // expect 20+ rows present
    const rows = page.locator('input[data-col="jersey"]');
    await expect(rows).toHaveCount(20, { timeout: 10000 }).catch(async () => {
      expect(await rows.count()).toBeGreaterThanOrEqual(20);
    });
  });
});

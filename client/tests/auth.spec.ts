import { test, expect } from '@playwright/test';

test.describe('authentication flows', () => {
  test('login, password visibility toggle, forgot password, and logout', async ({ page }) => {
    let loggedIn = false;

    const json = (route: any, data: any, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ success: status < 400, data, timestamp: new Date().toISOString(), ...(status >= 400 ? { error: { message: data?.message || 'Error' } } : {}) }),
      });

    await page.route('**/api/v1/auth/bootstrap-status', route => json(route, { needsBootstrap: false, setupTokenRequired: false }));
    await page.route('**/api/v1/auth/smtp-status', route => json(route, { enabled: false }));
    await page.route('**/api/v1/auth/me', async (route) => {
      if (loggedIn) {
        return json(route, { user: { id: 'u1', username: 'scorer', displayName: 'Scorer One', role: 'SCORER', mustChangePassword: false } });
      }
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Not authenticated', code: 'AUTH_REQUIRED' }, timestamp: new Date().toISOString() }) });
    });
    await page.route('**/api/v1/auth/login', async (route) => {
      const body = route.request().postDataJSON() as any;
      if (body?.username === 'scorer' && body?.password === 'Secret123!') {
        loggedIn = true;
        return json(route, { user: { id: 'u1', username: 'scorer', displayName: 'Scorer One', role: 'SCORER', mustChangePassword: false } });
      }
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Invalid username or password' }, timestamp: new Date().toISOString() }) });
    });
    await page.route('**/api/v1/auth/logout', async (route) => {
      loggedIn = false;
      return json(route, { ok: true });
    });
    await page.route('**/api/v1/auth/forgot-password', async (route) => {
      // generic no-enumeration response
      return json(route, { ok: true, requested: true, emailEnabled: false });
    });

    // Common app data to keep console stable after login
    await page.route('**/api/v1/matches**', route => json(route, []));
    await page.route('**/api/v1/system/info', route => json(route, { connectedClients: { total: 0, byType: { scorebug: 0, graphics: 0, console: 0, other: 0 } }, lanIpv4: [], port: 3000 }));
    await page.route('**/api/v1/system/courts**', route => json(route, { courts: [] }));
    await page.route('**/socket.io/**', route => route.abort());

    // --- Login page + password visibility toggle ---
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /QWESIE TV/i })).toBeVisible();
    await expect(page.getByLabel('Password or PIN')).toBeVisible();
    await expect(page.getByLabel('Remember me (7 days)')).toBeVisible();

    const password = page.locator('#password');
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(password).toHaveAttribute('type', 'password');

    // --- Login ---
    await page.getByLabel('Username').fill('scorer');
    await password.fill('Secret123!');
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    // Redirects to originally requested/default route (overview) and shows console
    await expect(page).toHaveURL(/\/overview/, { timeout: 15000 });
    await expect(page.getByText(/Scorer One/i).first()).toBeVisible({ timeout: 15000 });

    // --- Logout ---
    // Sign out from settings for reliability across viewports
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible({ timeout: 15000 });
    const signOutButtons = page.getByRole('button', { name: /^Sign out$/ });
    await expect(signOutButtons.first()).toBeVisible();
    await signOutButtons.first().click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await expect(page.getByRole('button', { name: /^Sign in$/ })).toBeVisible();

    // --- Forgot password ---
    await page.goto('/forgot-password', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Account recovery/i })).toBeVisible();
    await expect(page.getByText(/Admin recovery code/i)).toBeVisible();
    await expect(page.getByText(/Temporary password from admin/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Use a recovery code/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Use temporary password/i })).toBeVisible();

    // Email reset request (when SMTP shown/available in UI; here smtp disabled so form may be hidden - but link/options still present)
    // Navigate to reset page modes
    await page.getByRole('link', { name: /Use a recovery code/i }).click();
    await expect(page).toHaveURL(/\/reset-password\?mode=recovery/);
    await expect(page.getByRole('heading', { name: /Reset password/i })).toBeVisible();
    await expect(page.getByLabel('Recovery code')).toBeVisible();

    await page.goto('/forgot-password', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: /Use temporary password/i }).click();
    await expect(page).toHaveURL(/\/reset-password\?mode=temp/);
    await expect(page.getByLabel('Temporary password')).toBeVisible();

    // Back to login link works
    await page.getByRole('link', { name: /Back to sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

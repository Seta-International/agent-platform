import { expect, test } from '@playwright/test';

// Exercises the suite shell host (apps/web _authed layout) after the frontend
// modules were extracted into @seta/web-* packages. Proves the shell mounts each
// app's routes, the 9-dot launcher switches apps (URL + sidebar), the _authed
// guard wraps the mounted app routes, and the agent panel toggles from a
// non-agent app. Runs as the sandbox org.admin from global-setup storage state.

test.describe.configure({ mode: 'serial' });

test('login lands on a mounted app (planner)', async ({ page }) => {
  // resolveLanding falls back to the first permitted app for a fresh user.
  await page.goto('/');
  await expect(page).toHaveURL(/\/(planner|agent|admin)\b/);
});

test('app launcher switches between extracted-module apps', async ({ page }) => {
  await page.goto('/planner/my-tasks');
  await expect(page.getByRole('heading', { name: 'My tasks' })).toBeVisible();

  // Open the 9-dot launcher and jump to Agent Studio.
  await page.getByRole('button', { name: 'Open app launcher' }).click();
  await page.getByRole('button', { name: 'Agent Studio' }).click();
  await expect(page).toHaveURL(/\/agent\b/);
  // Agent app sidebar is now mounted (its nav items come from @seta/web-agent's manifest).
  await expect(page.getByRole('link', { name: 'Chat', exact: true })).toBeVisible();

  // Jump to Admin and confirm URL + sidebar swap again.
  await page.getByRole('button', { name: 'Open app launcher' }).click();
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\b/);
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible();
});

test('agent panel toggles from a non-agent app', async ({ page }) => {
  // The shell hides the agent button on /agent/* routes, so toggle it from planner.
  await page.goto('/planner/my-tasks');
  const toggle = page.getByRole('button', { name: 'Show agent panel' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  // Once open, the same button flips to the "Hide" affordance.
  await expect(page.getByRole('button', { name: 'Hide agent panel' })).toBeVisible();
});

test('_authed guard redirects an unauthenticated visit to a mounted app route', async ({
  browser,
}) => {
  // Fresh context with no storageState — proves the _authed beforeLoad guard wraps
  // the routes contributed by the extracted modules (e.g. /planner).
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto('/planner');
  await expect(page).toHaveURL(/\/login\b/);
  await expect(page).toHaveURL(/redirect=/);
  await ctx.close();
});

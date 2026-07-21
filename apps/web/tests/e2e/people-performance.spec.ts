import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, request, test } from '@playwright/test';

const REPO_ROOT = resolve(__dirname, '../../../..');

test.describe('performance entry (Story 1.1 / FUT-692)', () => {
  test('signed-in admin reaches /people/performance and the UI mirrors the context API (AC1)', async ({
    page,
  }) => {
    // The gate renders whatever GET /performance/context resolves for this
    // session — assert UI and API agree end-to-end rather than assuming the
    // sandbox admin's employee linkage.
    const ctx = await request.newContext({
      baseURL: 'http://localhost:5173',
      storageState: '.auth/admin.json',
    });
    const res = await ctx.get('/api/people/v1/performance/context');
    expect(res.ok()).toBe(true);
    const context = (await res.json()) as { status: string };
    await ctx.dispose();

    await page.goto('/people/performance');
    if (context.status === 'ok') {
      await expect(page.getByText(/Signed in with \d+ capacit/)).toBeVisible({ timeout: 8_000 });
    } else {
      await expect(page.getByText('No employee record found')).toBeVisible({ timeout: 8_000 });
    }
  });

  test('identity-only user is blocked with Contact HR, not the generic 403 (AC3)', async ({
    browser,
  }) => {
    const stamp = Date.now();
    const email = `e2e-perf-noperson-${stamp}@sandbox.test`;
    const password = `E2e-perf-block-${stamp}!Xq7`;

    // A user whose email matches no people.person row never gets a
    // user_projection link — the canonical "authenticates fine, no employee
    // record" persona. people.viewer carries people.performance.read.
    execSync(
      `pnpm -F @seta/cli exec tsx src/index.ts user-create --tenant sandbox ` +
        `--email ${email} --name "E2E NoPerson ${stamp}" --role people.viewer --password '${password}'`,
      { cwd: REPO_ROOT, stdio: 'pipe' },
    );

    const api = await request.newContext({ baseURL: 'http://localhost:5173' });
    const signIn = await api.post('/api/identity/v1/auth/sign-in/email', {
      data: { email, password },
    });
    expect(signIn.ok()).toBe(true);
    const storageState = await api.storageState();
    await api.dispose();

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await page.goto('/people/performance');
    await expect(page.getByText('No employee record found')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/contact HR/i)).toBeVisible();
    await expect(page.getByText('No access')).not.toBeVisible();
    await context.close();
  });
});

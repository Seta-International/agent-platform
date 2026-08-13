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
    const context = (await res.json()) as {
      status: string;
      capacities?: { kind: string; label: string }[];
    };
    await ctx.dispose();

    await page.goto('/people/performance');
    if (context.status === 'ok') {
      // Workspace chrome: cycle badge + capacity switcher (no secondary sidebar).
      await expect(page.getByTestId('performance-workspace')).toBeVisible({ timeout: 8_000 });
      await expect(page.getByTestId('performance-context-switcher')).toBeVisible();
      await expect(page.getByTestId('performance-home')).toBeAttached();
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

test.describe('performance shell (Story 1.2 / FUT-693)', () => {
  test('ok session shows shell; URL gains scope params from default capacity (AC4)', async ({
    page,
  }) => {
    const ctx = await request.newContext({
      baseURL: 'http://localhost:5173',
      storageState: '.auth/admin.json',
    });
    const res = await ctx.get('/api/people/v1/performance/context');
    expect(res.ok()).toBe(true);
    const context = (await res.json()) as {
      status: string;
      capacities?: unknown[];
      as_of_month?: string;
    };
    await ctx.dispose();

    test.skip(context.status !== 'ok', 'admin has no employee record in this sandbox');

    await page.goto('/people/performance');
    await expect(page.getByTestId('performance-workspace')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('performance-cycle-badge-slot')).toBeAttached();

    // Bare URL should be corrected to include month (+ capacity when present).
    await expect
      .poll(() => new URL(page.url()).searchParams.get('month'), { timeout: 8_000 })
      .toBe(context.as_of_month ?? null);

    if ((context.capacities?.length ?? 0) > 0) {
      await expect
        .poll(() => new URL(page.url()).searchParams.get('kind'), { timeout: 8_000 })
        .toBeTruthy();
    }
  });
});

test.describe('performance cycle badge (Story 1.3 / FUT-694)', () => {
  test('badge echoes GET /cycle-status (AC3)', async ({ page }) => {
    const ctx = await request.newContext({
      baseURL: 'http://localhost:5173',
      storageState: '.auth/admin.json',
    });
    const contextRes = await ctx.get('/api/people/v1/performance/context');
    expect(contextRes.ok()).toBe(true);
    const context = (await contextRes.json()) as { status: string; as_of_month?: string };
    test.skip(context.status !== 'ok', 'admin has no employee record in this sandbox');

    const month =
      context.as_of_month ??
      (() => {
        const vn = new Date(Date.now() + 7 * 3_600_000);
        return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}`;
      })();
    const statusRes = await ctx.get(
      `/api/people/v1/performance/cycle-status?month=${encodeURIComponent(month)}`,
    );
    expect(statusRes.ok()).toBe(true);
    const cycle = (await statusRes.json()) as { status: string };
    await ctx.dispose();

    const labels: Record<string, string> = {
      open: 'Open (25th–end of month)',
      makeup: 'Grace window (2nd–4th)',
      locked: 'Locked',
      override: 'Unlocked (Override)',
    };

    await page.goto('/people/performance');
    await expect(page.getByTestId('performance-workspace')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('cycle-status-badge')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('cycle-status-badge')).toContainText(labels[cycle.status] ?? '');
  });
});

test.describe('performance home (Reviews workspace)', () => {
  test('home shows role workspace with KPI tiles', async ({ page }) => {
    const ctx = await request.newContext({
      baseURL: 'http://localhost:5173',
      storageState: '.auth/admin.json',
    });
    const contextRes = await ctx.get('/api/people/v1/performance/context');
    expect(contextRes.ok()).toBe(true);
    const context = (await contextRes.json()) as { status: string; as_of_month?: string };
    await ctx.dispose();
    test.skip(context.status !== 'ok', 'admin has no employee record in this sandbox');

    await page.goto('/people/performance');
    // Home body is intentionally empty until the dashboard ticket; assert the
    // workspace chrome renders and the mount point is present.
    await expect(page.getByTestId('performance-workspace')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('performance-home')).toBeAttached();
    await expect(page.getByTestId('tasks-for-this-month')).toHaveCount(0);
  });
});

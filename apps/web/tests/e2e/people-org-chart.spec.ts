import { expect, request, test } from '@playwright/test';

// Runs as org.admin (wildcard) from global-setup storage state. Company/Account/Project data come
// from the dev fixture seed. When the tenant has no seeded units/accounts the relevant assertions
// skip — backend shape is covered by the people org read-fn integration tests.

interface CompanyNode {
  id: string;
  kind: string;
  label: string;
}
interface DeliveryMember {
  person_id: string;
  full_name: string;
}
interface DeliveryProject {
  project_id: string;
  name: string;
  members: DeliveryMember[];
}
interface DeliveryAccount {
  account_id: string;
  name: string;
  projects: DeliveryProject[];
}

let companyNodes: CompanyNode[] = [];
let accounts: DeliveryAccount[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const ctx = await request.newContext({
    baseURL: 'http://localhost:5173',
    storageState: '.auth/admin.json',
  });
  const companyRes = await ctx.get('/api/people/v1/org/company');
  if (companyRes.ok()) companyNodes = ((await companyRes.json()) as { nodes: CompanyNode[] }).nodes;
  const delRes = await ctx.get('/api/people/v1/org/delivery');
  if (delRes.ok()) accounts = ((await delRes.json()) as { accounts: DeliveryAccount[] }).accounts;
  await ctx.dispose();
});

// ─── Test 1: Company tab renders the org-unit skeleton ────────────────────────
test('company tab renders the org-unit skeleton', async ({ page }) => {
  await page.goto('/people/org');
  await expect(page.getByRole('heading', { name: 'Org Chart' })).toBeVisible({ timeout: 8_000 });

  const unit = companyNodes.find((n) => n.kind === 'executive') ?? companyNodes[0];
  if (!unit) {
    test.skip(true, 'no company nodes seeded — covered by people integration tests');
    return;
  }
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('.react-flow__node').filter({ hasText: unit.label }).first(),
  ).toBeVisible({ timeout: 5_000 });
});

// ─── Test 2: Account tab defaults to the first account and renders it ─────────
test('account tab renders the default account', async ({ page }) => {
  if (accounts.length === 0) {
    test.skip(true, 'no delivery accounts seeded');
    return;
  }
  await page.goto('/people/org');
  await page
    .getByRole('radiogroup', { name: 'Org chart view' })
    .getByRole('radio', { name: 'Account' })
    .click();

  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('.react-flow__node').filter({ hasText: accounts[0]!.name }).first(),
  ).toBeVisible({ timeout: 5_000 });
});

// ─── Test 3: Account tab member click → worker profile ────────────────────────
test('account tab: clicking a member opens the worker profile', async ({ page }) => {
  // The Account tab defaults to accounts[0]; only run if it has a project member.
  const account = accounts[0];
  const member = account?.projects.flatMap((p) => p.members)[0];
  if (!account || !member) {
    test.skip(true, 'first account has no project member seeded');
    return;
  }
  await page.goto('/people/org');
  await page
    .getByRole('radiogroup', { name: 'Org chart view' })
    .getByRole('radio', { name: 'Account' })
    .click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 10_000 });

  await page.locator('.react-flow__node').filter({ hasText: member.full_name }).first().click();

  await expect(page).toHaveURL(new RegExp(`/people/employees/${member.person_id}`), {
    timeout: 8_000,
  });
});

// ─── Test 4: tab + selection are cached on the URL and survive a reload ───────
test('selection is cached on the URL and restored after reload', async ({ page }) => {
  if (accounts.length === 0) {
    test.skip(true, 'no delivery accounts seeded');
    return;
  }
  await page.goto('/people/org');
  await page
    .getByRole('radiogroup', { name: 'Org chart view' })
    .getByRole('radio', { name: 'Account' })
    .click();

  // The URL captures the view and the defaulted account selection.
  await expect(page).toHaveURL(/[?&]view=account/, { timeout: 8_000 });
  await expect(page).toHaveURL(/[?&]account=/, { timeout: 8_000 });

  // Reloading restores the same account view + node (no reset to Company).
  await page.reload();
  await expect(page).toHaveURL(/[?&]view=account/, { timeout: 8_000 });
  await expect(
    page.locator('.react-flow__node').filter({ hasText: accounts[0]!.name }).first(),
  ).toBeVisible({ timeout: 10_000 });
});

// ─── Test 5: clicking an account on the Company tab drills into the Account view ─
test('company tab: clicking an account node drills into the Account view', async ({ page }) => {
  const account = accounts[0];
  if (!account) {
    test.skip(true, 'no delivery accounts seeded');
    return;
  }
  await page.goto('/people/org');
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 10_000 });

  await page.locator('.react-flow__node').filter({ hasText: account.name }).first().click();

  await expect(page).toHaveURL(new RegExp(`[?&]account=${account.account_id}`), { timeout: 8_000 });
  await expect(page).toHaveURL(/[?&]view=account/, { timeout: 8_000 });
});

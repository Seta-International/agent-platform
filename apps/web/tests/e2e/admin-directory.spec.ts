import { expect, request, test } from '@playwright/test';

// Runs as org.admin (wildcard) from global-setup storage state.
// Admin holds identity.user.list + identity.user.update (role identity.admin).
//
// The admin directory (GET/POST /api/people/v1/directory*) is served by people,
// reading person + worker directly (joined with people.user_projection for
// account status); there is no identity-side projection anymore.
// beforeAll creates 4 fresh workers via the people API, then polls the directory
// until they appear (retry loop kept for CI resilience, not for event lag).

test.describe('admin directory', () => {
  test.describe.configure({ mode: 'serial' });

  interface DirectoryRow {
    person_id: string;
    full_name: string;
    work_email: string | null;
    account_status: 'none' | 'active' | 'suspended';
    employment_status: 'active' | 'terminated';
  }

  let provisionTarget: DirectoryRow;
  let suspendTarget: DirectoryRow;
  let bulk1Target: DirectoryRow;
  let bulk2Target: DirectoryRow;

  test.beforeAll(async () => {
    const STAMP = Date.now();

    const ctx = await request.newContext({
      baseURL: 'http://localhost:5173',
      storageState: '.auth/admin.json',
    });

    // 1. Create 4 fresh workers (unique by STAMP → no state collision across runs).
    const fixtures = [
      { name: `E2E Provision ${STAMP}`, email: `e2e-prov-${STAMP}@sandbox.test` },
      { name: `E2E Suspend ${STAMP}`, email: `e2e-susp-${STAMP}@sandbox.test` },
      { name: `E2E Bulk1 ${STAMP}`, email: `e2e-bulk1-${STAMP}@sandbox.test` },
      { name: `E2E Bulk2 ${STAMP}`, email: `e2e-bulk2-${STAMP}@sandbox.test` },
    ];

    for (const { name, email } of fixtures) {
      const res = await ctx.post('/api/people/v1/workers', {
        data: { full_name: name, work_email: email },
      });
      if (!res.ok())
        throw new Error(`create worker "${name}": ${res.status()} ${await res.text()}`);
    }

    // 2. Poll the directory API until all 4 new workers appear (graphile-worker
    //    typically delivers the event within 1–3 s; allow up to 30 s for slow CI).
    let dirRows: DirectoryRow[] = [];
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const res = await ctx.get(
        `/api/people/v1/directory?search=${encodeURIComponent(String(STAMP))}`,
      );
      if (res.ok()) {
        const body = (await res.json()) as { rows: DirectoryRow[] };
        if (body.rows.length >= 4) {
          dirRows = body.rows;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    if (dirRows.length < 4) {
      throw new Error(
        `directory projection not populated after 30 s — ` +
          `ensure the feature branch server is running (not main); ` +
          `found ${dirRows.length} rows for stamp ${STAMP}`,
      );
    }

    // 3. Assign fixture slots by name (search returns alpha-sorted, but names with
    //    the same STAMP are unambiguous — we just need distinct workers).
    const find = (name: string): DirectoryRow => {
      const row = dirRows.find((r) => r.full_name === name);
      if (!row) throw new Error(`directory row not found for "${name}"`);
      return row;
    };
    provisionTarget = find(`E2E Provision ${STAMP}`);
    suspendTarget = find(`E2E Suspend ${STAMP}`);
    bulk1Target = find(`E2E Bulk1 ${STAMP}`);
    bulk2Target = find(`E2E Bulk2 ${STAMP}`);

    // 4. Pre-provision suspend + bulk targets so they arrive in `active` state.
    for (const target of [suspendTarget, bulk1Target, bulk2Target]) {
      const res = await ctx.post(`/api/people/v1/directory/${target.person_id}/provision`);
      // 409 = already provisioned from a prior run — treat as success.
      if (!res.ok() && res.status() !== 409) {
        throw new Error(`provision "${target.full_name}": ${res.status()} ${await res.text()}`);
      }
    }

    await ctx.dispose();
  });

  test('provision: no-account person → status Active', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Directory' })).toBeVisible({ timeout: 8_000 });

    // Search by email (unique per tenant) so only one row is visible.
    await page.getByPlaceholder('Search people…').fill(provisionTarget.work_email!);
    const row = page.getByRole('row').filter({ hasText: provisionTarget.full_name });
    await expect(row).toBeVisible({ timeout: 8_000 });

    // Confirm initial badge.
    await expect(row.getByText('No account')).toBeVisible();

    // Row action → Provision.
    await row.getByRole('button', { name: `Row actions for ${provisionTarget.full_name}` }).click();
    await page.getByRole('menuitem', { name: 'Provision' }).click();

    await expect(page.getByText('Account provisioned')).toBeVisible({ timeout: 8_000 });
    // Table invalidates + refetches; badge flips to Active.
    await expect(row.getByText('Active')).toBeVisible({ timeout: 8_000 });
  });

  test('suspend: active account → status Suspended', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Directory' })).toBeVisible({ timeout: 8_000 });

    await page.getByPlaceholder('Search people…').fill(suspendTarget.work_email!);
    const row = page.getByRole('row').filter({ hasText: suspendTarget.full_name });
    await expect(row).toBeVisible({ timeout: 8_000 });
    // Confirm the badge starts as Active (pre-provisioned in beforeAll).
    await expect(row.getByText('Active')).toBeVisible();

    // Row action → Suspend.
    await row.getByRole('button', { name: `Row actions for ${suspendTarget.full_name}` }).click();
    await page.getByRole('menuitem', { name: 'Suspend' }).click();

    // Confirm dialog.
    const dialog = page.getByRole('dialog', { name: 'Suspend account?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Suspend', exact: true }).click();

    await expect(page.getByText('Account suspended')).toBeVisible({ timeout: 8_000 });
    // Table refetches; badge flips to Suspended.
    await expect(row.getByText('Suspended')).toBeVisible({ timeout: 8_000 });
  });

  test('bulk assign: multi-select two active accounts → people.viewer granted', async ({
    page,
  }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Directory' })).toBeVisible({ timeout: 8_000 });

    // Filter the status dropdown to Active so both bulk targets are visible together.
    // The SelectTrigger renders as role="combobox"; there is only one Select on the
    // toolbar at this point (the status filter), so scoping to the first is unambiguous.
    const statusTrigger = page.getByRole('combobox').first();
    await statusTrigger.click();
    await page.getByRole('option', { name: 'Active' }).click();

    // Search by shared bulk email prefix so only the two bulk fixture rows show.
    // Both emails contain the unique STAMP.
    const stampStr = String(bulk1Target.work_email!.split('@')[0]!.split('-').pop()!);
    await page.getByPlaceholder('Search people…').fill(stampStr);

    const row1 = page.getByRole('row').filter({ hasText: bulk1Target.full_name });
    const row2 = page.getByRole('row').filter({ hasText: bulk2Target.full_name });
    await expect(row1).toBeVisible({ timeout: 8_000 });
    await expect(row2).toBeVisible({ timeout: 8_000 });

    await expect(row1.getByText('Active')).toBeVisible();
    await expect(row2.getByText('Active')).toBeVisible();

    // Check both rows' selection checkboxes.
    await row1.getByRole('checkbox', { name: 'Select row' }).click();
    await row2.getByRole('checkbox', { name: 'Select row' }).click();

    // BulkRoleBar should appear with "2 selected".
    await expect(page.getByText('2 selected')).toBeVisible({ timeout: 4_000 });

    // Open the role combobox (aria-label="Role") and select people.viewer.
    // The option label is "Read people records" (the role description); typing the slug
    // "people.viewer" filters via the keyword list.
    await page.getByRole('combobox', { name: 'Role' }).click();
    await page.getByPlaceholder('Search…').fill('people.viewer');
    await page.getByRole('option', { name: 'Read people records' }).click();

    // Click Assign to open the confirmation dialog.
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    const confirmDialog = page.getByRole('dialog', { name: 'Assign role?' });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Confirm' }).click();

    // Toast: bulkRole returns { granted: 2, revoked: 0, skipped: 0 } → "2 updated".
    await expect(page.getByText('2 updated')).toBeVisible({ timeout: 8_000 });
    // BulkRoleBar clears on success (onClearSelection called).
    await expect(page.getByText('2 selected')).not.toBeVisible({ timeout: 4_000 });
  });
});

// Pre-req: Playwright runner is provisioned in a separate slice. Until then this file documents
// the RBAC negative-path contract introduced in the workflow-runs polish PR.
import { expect, test } from '@playwright/test';

test('contributor cannot select tenant scope in the runs inbox', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'contributor@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  await page.goto('/copilot/workflows');
  const scope = page.getByLabel(/Scope/);
  await scope.click();
  // Tenant must be absent for a contributor (lacks copilot.workflow.run.read.tenant).
  await expect(page.getByRole('option', { name: /tenant/i })).toHaveCount(0);
});

test('ops viewer can see an approval but cannot decide it', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'ops-viewer@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  await page.goto('/copilot/workflows');
  // Pick any paused run.
  await page.locator('[aria-label="status: paused"]').first().click();
  const approve = page.getByRole('button', { name: 'Approve' });
  await expect(approve).toBeVisible();
  await expect(approve).toBeDisabled();
});

test('cross-tenant run drilldown surfaces Not found rather than the run', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'demo@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  // Hardcoded other-tenant run id, seeded as part of the demo fixtures.
  await page.goto('/copilot/workflows/runs/00000000-0000-0000-0000-deadbeef0001');
  await expect(page.getByText(/Run not found|cannot view/i)).toBeVisible();
});

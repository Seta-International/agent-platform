import { expect, test } from '@playwright/test';

// Runs as the sandbox org.admin (wildcard) from global-setup storage state,
// which holds identity.role.grant. Selects every user on the page, bulk-assigns
// knowledge.viewer, and confirms the summary + persistence. Idempotent: a second
// run is all-skips but still shows a summary toast and the role filter still
// returns the affected users.

test.describe.configure({ mode: 'serial' });

test('admin bulk role: select users, assign a role, see the summary', async ({ page }) => {
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

  // Wait for the user rows to load, then select every user on the page.
  await expect(page.getByRole('checkbox', { name: 'Select row' }).first()).toBeVisible();
  await page.getByRole('checkbox', { name: 'Select page' }).click();
  await expect(page.getByText(/\d+ selected/)).toBeVisible();

  // Open the assign dialog, pick a role, confirm.
  await page.getByRole('button', { name: 'Assign role' }).click();
  await page.locator('#bulk-role-select').selectOption('knowledge.viewer');
  await expect(page.getByText(/Grant knowledge\.viewer to \d+/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).click();

  // Summary toast (granted/skipped) appears and the selection bar clears.
  await expect(page.getByText(/knowledge\.viewer:.*skipped/i)).toBeVisible();
  await expect(page.getByText(/\d+ selected/)).toHaveCount(0);

  // Persisted: filter the table by the granted role and expect ≥1 user.
  await page.getByRole('button', { name: 'Role' }).click();
  await page.getByRole('button', { name: 'knowledge.viewer', exact: true }).click();
  await expect(page).toHaveURL(/role=knowledge\.viewer/);
  await expect(page.getByRole('checkbox', { name: 'Select row' }).first()).toBeVisible();
});

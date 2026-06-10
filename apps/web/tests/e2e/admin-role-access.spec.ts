import { expect, test } from '@playwright/test';

// Runs as the sandbox org.admin (wildcard) from global-setup storage state, which
// holds identity.role.read + identity.role.write.
//
// Deferred — the "read-only admin sees disabled checkboxes" path is not covered:
// no built-in role grants identity.role.read WITHOUT identity.role.write (both
// were added to identity.admin together; identity.viewer has neither), so a
// read-only-for-this-feature actor can't be provisioned from seeded roles.
// The disabled-state branch is covered by the component's usePermission gate.

test.describe.configure({ mode: 'serial' });

test('admin role-access: nav highlights and route is reachable', async ({ page }) => {
  await page.goto('/admin/users');
  const navLink = page.getByRole('link', { name: 'Role access', exact: true });
  await expect(navLink).toBeVisible();
  await navLink.click();
  await expect(page).toHaveURL(/\/admin\/role-access/);
  await expect(page.getByRole('heading', { name: 'Role access' })).toBeVisible();
});

test('admin role-access: toggling a cell persists and reset restores defaults', async ({
  page,
}) => {
  await page.goto('/admin/role-access');
  await expect(page.getByRole('heading', { name: 'Role access' })).toBeVisible();

  // Start from the Knowledge module and reset the Viewer role so the run is idempotent.
  await page.getByRole('tab', { name: 'Knowledge' }).click();
  const resetViewer = page.getByRole('button', { name: 'Reset knowledge.viewer to defaults' });
  if (await resetViewer.isEnabled()) await resetViewer.click();

  // knowledge.viewer lacks knowledge.file.write by seed — toggle it on.
  const cell = page.getByRole('checkbox', { name: /^Viewer .*knowledge\.file\.write$/ });
  await expect(cell).toHaveAttribute('data-state', 'unchecked');
  await cell.click();
  await expect(cell).toHaveAttribute('data-state', 'checked');

  // Persisted: reload and the grant survives.
  await page.reload();
  await page.getByRole('tab', { name: 'Knowledge' }).click();
  const cellAfter = page.getByRole('checkbox', { name: /^Viewer .*knowledge\.file\.write$/ });
  await expect(cellAfter).toHaveAttribute('data-state', 'checked');

  // Reset restores the seed default (unchecked).
  await page.getByRole('button', { name: 'Reset knowledge.viewer to defaults' }).click();
  await expect(
    page.getByRole('checkbox', { name: /^Viewer .*knowledge\.file\.write$/ }),
  ).toHaveAttribute('data-state', 'unchecked');
});

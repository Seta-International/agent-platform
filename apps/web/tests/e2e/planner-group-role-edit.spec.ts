// Pre-req: Playwright runner is provisioned in a separate slice. Until then this file documents
// the role-pill edit flow contract for the new group Members tab (PR2).
import { expect, test } from '@playwright/test';

test('owner promotes a member to Owner via the role dropdown', async ({ page }) => {
  // Seeded fixtures: <group-id> with at least one Member-role user named "Alex Member".
  await page.goto('/planner/groups/<seeded-group-id>?tab=members');

  // The row's role control is a Select (combobox) when the viewer can manage roles on a native group.
  const memberRow = page.getByRole('row', { name: /Alex Member/ });
  const roleSelect = memberRow.getByRole('combobox', { name: /Change role/i });
  await expect(roleSelect).toHaveValue('member');

  await roleSelect.selectOption('owner');

  // Optimistic update — the pill/value flips before the network roundtrip resolves.
  await expect(roleSelect).toHaveValue('owner');

  // After server-confirms, the cache invalidates; reloading the page reflects the persisted value.
  await page.reload();
  const roleSelectAfter = page
    .getByRole('row', { name: /Alex Member/ })
    .getByRole('combobox', { name: /Change role/i });
  await expect(roleSelectAfter).toHaveValue('owner');
});

test('linked (M365) group member rows show disabled role control with M365 tooltip', async ({
  page,
}) => {
  // Seeded fixtures: <linked-group-id> has external_source = 'm365'.
  await page.goto('/planner/groups/<linked-group-id>?tab=members');

  // No combobox is rendered; the role appears as a static pill.
  await expect(page.getByRole('combobox', { name: /Change role/i })).toHaveCount(0);

  const pill = page.getByText(/^(Owner|Member)$/).first();
  await pill.hover();
  await expect(page.getByText(/Managed in M365/i)).toBeVisible();
});

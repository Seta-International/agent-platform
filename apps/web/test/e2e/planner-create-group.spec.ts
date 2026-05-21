// Pre-req: Playwright runner is provisioned in a separate slice. Until then this file documents
// the create-group flow contract introduced in PR2 (planner groups UI rewrite).
import { expect, test } from '@playwright/test';

test('admin creates a group with description, theme, and visibility', async ({ page }) => {
  await page.goto('/planner/groups');

  await page
    .getByRole('button', { name: /\+ New group|New group/ })
    .first()
    .click();

  await page.getByLabel('Group name').fill('Customer Success');
  await page.getByLabel(/Description/).fill('Post-sale work');
  await page.getByRole('button', { name: 'green' }).click();
  await page.getByRole('radio', { name: /Workspace/ }).click();

  await page.getByRole('button', { name: /Create group/ }).click();

  // Land on the list (or detail, depending on routing); the new group must appear.
  await expect(page.getByText('Customer Success')).toBeVisible();
  // Visibility pill reflects the selection.
  await expect(page.getByText('Public').first()).toBeVisible();
});

test('cmd+enter submits the create-group dialog', async ({ page }) => {
  await page.goto('/planner/groups');
  await page
    .getByRole('button', { name: /New group/ })
    .first()
    .click();
  await page.getByLabel('Group name').fill('Quick Group');
  await page.keyboard.press('Meta+Enter');
  await expect(page.getByText('Quick Group')).toBeVisible();
});

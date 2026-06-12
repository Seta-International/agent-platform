// Pre-req: Playwright runner is provisioned in a separate slice. Until then this file documents the
// inline label-management contract (rename / recolor / delete) in the task-detail label flyout.
import { expect, test } from '@playwright/test';

test('Labels flyout: rename a label updates the chip on the task', async ({ page }) => {
  await page.goto('/planner/plans/<seeded-plan-id>/tasks/<seeded-task-id>');

  // Open the label flyout, open the edit panel for the "Bug" label via its pencil.
  await page.getByRole('button', { name: 'Add label' }).click();
  await page.getByRole('button', { name: 'Edit Bug' }).click();

  // Rename, save.
  const nameInput = page.getByLabel('Label name');
  await nameInput.fill('Defect');
  await page.getByRole('button', { name: 'Save' }).click();

  // The applied chip on the task reflects the new name.
  await expect(page.getByText('Defect')).toBeVisible();
});

test('Labels flyout: recolor a label via a swatch', async ({ page }) => {
  await page.goto('/planner/plans/<seeded-plan-id>/tasks/<seeded-task-id>');

  await page.getByRole('button', { name: 'Add label' }).click();
  await page.getByRole('button', { name: 'Edit Defect' }).click();

  // Pick the "purple" swatch from the color radiogroup, save.
  await page.getByRole('radio', { name: 'purple' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  // Chip now carries the purple variant class.
  await expect(page.locator('.label-chip--purple', { hasText: 'Defect' })).toBeVisible();
});

test('Labels flyout: delete a label removes it from the task (cascade)', async ({ page }) => {
  await page.goto('/planner/plans/<seeded-plan-id>/tasks/<seeded-task-id>');

  await page.getByRole('button', { name: 'Add label' }).click();
  await page.getByRole('button', { name: 'Edit Defect' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();

  // Confirm in the destructive dialog.
  await page.getByRole('button', { name: 'Delete label' }).click();

  // Gone from the task and from the flyout.
  await expect(page.getByText('Defect')).toHaveCount(0);
});

test('Labels flyout: M365-linked plan shows no edit affordance', async ({ page }) => {
  await page.goto('/planner/plans/<seeded-m365-plan-id>/tasks/<seeded-m365-task-id>');

  await page.getByRole('button', { name: 'Add label' }).click();

  // Slot-less labels render disabled ("Local only"); no pencil edit buttons exist.
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0);
});

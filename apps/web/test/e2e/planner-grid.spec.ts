// Pre-req: Playwright runner is provisioned in a separate slice. Until then this file documents the
// Grid view inline-edit + bulk-action contract.
import { expect, test } from '@playwright/test';

test('Grid view: inline-edit title, shift-select rows, bulk-move to Done clears selection', async ({
  page,
}) => {
  await page.goto('/planner/plans/<seeded-plan-id>?view=grid');

  // Click the first row's title cell and type a new title.
  const firstTitleCell = page.locator('.grid-row').first().locator('.grid-cell--title');
  await firstTitleCell.click();
  const titleInput = firstTitleCell.locator('input');
  await titleInput.fill('Grid-edited');
  await page.keyboard.press('Enter');

  // After committing, the cell reverts to display mode with the new title.
  await expect(firstTitleCell).toHaveText('Grid-edited');

  // Click checkbox #1 (row index 0), then shift-click checkbox #3 (row index 2) to select rows 1–3.
  const checkboxes = page.locator('.grid-row__checkbox');
  await checkboxes.nth(0).click();
  await checkboxes.nth(2).click({ modifiers: ['Shift'] });

  await expect(page.locator('.grid-bulk-action-footer')).toHaveText(/3 selected/);

  // Click Move in the bulk footer, then pick the "Done" bucket.
  await page.locator('.grid-bulk-action-footer').getByRole('button', { name: 'Move' }).click();
  await page.getByRole('option', { name: 'Done' }).click();

  // Moving clears the selection; the bulk footer disappears.
  await expect(page.locator('.grid-bulk-action-footer')).toHaveCount(0);
});

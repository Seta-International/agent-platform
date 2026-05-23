// Pre-req: Playwright runner is provisioned in a separate slice. Until then this file documents the
// Grid view inline-edit + bulk-action contract.
import { expect, test } from '@playwright/test';

test('Grid view: inline-edit title, shift-select rows, bulk-move to Done clears selection', async ({
  page,
}) => {
  await page.goto('/planner/plans/<seeded-plan-id>?view=grid');

  // Click the first data row's title trigger (skip group-header rows).
  const firstDataRow = page.locator('.task-grid tbody tr:not(.task-grid__group-header)').first();
  const firstTitleTrigger = firstDataRow.locator('button.task-grid__title-trigger');
  await firstTitleTrigger.click();

  // After clicking the trigger the cell switches to an inline input.
  const titleInput = firstDataRow.locator('input[aria-label="Edit title"]');
  await titleInput.fill('Grid-edited');
  await page.keyboard.press('Enter');

  // After committing, the cell reverts to the trigger with the new title.
  await expect(firstDataRow.locator('button.task-grid__title-trigger')).toHaveText('Grid-edited');

  // Click checkbox #1 (row index 0), then shift-click checkbox #3 (row index 2) to select rows 1–3.
  const dataRows = page.locator('.task-grid tbody tr:not(.task-grid__group-header)');
  await dataRows.nth(0).locator('input[type="checkbox"]').click();
  await dataRows
    .nth(2)
    .locator('input[type="checkbox"]')
    .click({ modifiers: ['Shift'] });

  await expect(page.locator('.grid-bulk-action-footer')).toHaveText(/3 selected/);

  // Click Move in the bulk footer, then pick the "Done" bucket.
  await page.locator('.grid-bulk-action-footer button').filter({ hasText: 'Move' }).click();
  await page.getByRole('option', { name: 'Done' }).click();

  // Moving clears the selection; the bulk footer disappears.
  await expect(page.locator('.grid-bulk-action-footer')).toHaveCount(0);
});

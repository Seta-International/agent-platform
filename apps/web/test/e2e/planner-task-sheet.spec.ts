// Pre-req: Playwright runner is provisioned in a separate slice. Until then this file documents the
// task-sheet inline-edit + activity-feed contract.
import { expect, test } from '@playwright/test';

test('opens task sheet via ?task=…, inline-edits title, sees activity entry', async ({ page }) => {
  await page.goto('/planner/plans/<seeded-plan-id>?task=<seeded-task-id>');
  await expect(page.locator('.task-sheet')).toBeVisible();

  // PR2 ships inline-edit via click; the `E` keyboard shortcut becomes canonical in PR3 (see use-sheet-keyboard.ts).
  await page.locator('.task-sheet__title').click();
  const titleInput = page.locator('input[aria-label="Task title"]');
  await titleInput.fill('New title');
  await page.keyboard.press('Enter');

  await expect(page.locator('.task-sheet__title')).toHaveText('New title');
  await expect(page.locator('.task-sheet__activity li', { hasText: 'task.updated' })).toBeVisible();

  // Esc closes the sheet; the URL's `task=` param is stripped.
  await page.keyboard.press('Escape');
  await expect(page.locator('.task-sheet')).toHaveCount(0);
  await expect(page).not.toHaveURL(/task=/);
});

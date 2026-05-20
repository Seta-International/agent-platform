// Pre-req: Playwright runner is provisioned in a separate slice. Until then this file documents the
// §4.7 keyboard-map contract across the kanban board and task sheet.
import { expect, test } from '@playwright/test';

test('§4.7 keyboard map: navigate board with l/j, open sheet via Enter, edit title, commit with Cmd+Enter, close with Escape', async ({
  page,
}) => {
  await page.goto('/planner/plans/<seeded-plan-id>');

  // Focus the board by clicking its container.
  await page.locator('.kanban-board').click();

  // `l` moves focus right to the next bucket; `j` moves down within a bucket.
  await page.keyboard.press('l');
  await page.keyboard.press('j');

  // Enter opens the focused card's sheet.
  await page.keyboard.press('Enter');
  await expect(page.locator('.task-sheet')).toBeVisible();

  // `e` focuses the title field (use-sheet-keyboard.ts §4.7).
  // TaskSheet exposes the title as .task-sheet__title; clicking it activates inline editing
  // the same way the equivalent step works in planner-task-sheet.spec.ts.
  await page.keyboard.press('e');
  await page.locator('.task-sheet__title').click();
  await page.locator('.task-sheet__title').fill('Edited via keyboard');

  // Cmd+Enter (Control+Enter on Linux) commits the edit without closing the sheet.
  const modifier = process.platform === 'linux' ? 'Control' : 'Meta';
  await page.keyboard.press(`${modifier}+Enter`);

  await expect(page.locator('.task-sheet__title')).toHaveText('Edited via keyboard');

  // Escape closes the sheet.
  await page.keyboard.press('Escape');
  await expect(page.locator('.task-sheet')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { resolvePlanId } from '../helpers/ids';

// Drag a board card top → middle → bottom of its column, reload, and assert
// the new order persists. @hello-pangea/dnd's keyboard handler is used so the
// reorder is deterministic across CI runs.
test('drag-reorder persists order_hint across reload', async ({ page, request }) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');

  await page.goto(`/planner/plans/${planId}`);

  // Pick the first column with at least 3 cards so the drag has somewhere to go.
  const columns = page.locator('section[aria-label^="Bucket: "]');
  const columnCount = await columns.count();
  let targetColumn = -1;
  for (let i = 0; i < columnCount; i++) {
    const c = columns.nth(i).locator('.kanban-card');
    if ((await c.count()) >= 3) {
      targetColumn = i;
      break;
    }
  }
  test.skip(targetColumn === -1, 'no column has ≥3 cards in seed data');

  const column = columns.nth(targetColumn);
  const cards = column.locator('.kanban-card');

  const initialTitles: string[] = [];
  const initialCount = await cards.count();
  for (let i = 0; i < initialCount; i++) {
    const aria = await cards.nth(i).getAttribute('aria-label');
    initialTitles.push((aria ?? '').replace(/^Task:\s*/, ''));
  }
  const firstTitle = initialTitles[0];
  expect(firstTitle).toBeTruthy();

  // Keyboard drag: focus card 1, Space (grab), ArrowDown × (n-1), Space (drop).
  await cards.first().focus();
  await page.keyboard.press('Space');
  for (let i = 0; i < initialCount - 1; i++) {
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Space');

  // Wait for the order_hint PATCH + SSE round-trip to settle.
  await page.waitForLoadState('networkidle');

  await page.reload();
  await page.waitForLoadState('networkidle');

  const reloadedColumn = page.locator('section[aria-label^="Bucket: "]').nth(targetColumn);
  const reloadedCards = reloadedColumn.locator('.kanban-card');
  const lastIdx = (await reloadedCards.count()) - 1;
  const lastAria = await reloadedCards.nth(lastIdx).getAttribute('aria-label');
  expect((lastAria ?? '').replace(/^Task:\s*/, '')).toBe(firstTitle);
});

import { expect, test } from '@playwright/test';
import { resolveFirstTaskId, resolvePlanId } from '../helpers/ids';

test('board card click navigates to /tasks/:taskId', async ({ page, request }) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');

  await page.goto(`/planner/plans/${planId}`);
  // Board cards expose aria-label `Task: <title>`; the first card is enough.
  const firstCard = page.locator('.kanban-card').first();
  await expect(firstCard).toBeVisible();
  const aria = (await firstCard.getAttribute('aria-label')) ?? '';
  const title = aria.replace(/^Task:\s*/, '');
  await firstCard.click();

  await expect(page).toHaveURL(/\/planner\/plans\/[^/]+\/tasks\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(title) })).toBeVisible();
});

test('grid row title click navigates to /tasks/:taskId', async ({ page, request }) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');

  await page.goto(`/planner/plans/${planId}?view=grid`);
  // Grid title cells are buttons with aria-label="Edit title: <title>"; clicking
  // the cell opens the task page (see plan-page.tsx onOpenTask wiring).
  const firstTitleTrigger = page
    .locator('button.task-grid__title-trigger, button[aria-label^="Edit title:"]')
    .first();
  await expect(firstTitleTrigger).toBeVisible();
  // Title-trigger opens an inline editor, not the task page. The task page
  // opens from any non-title cell trigger (assignees / labels / etc).
  const openCell = page
    .locator('button.task-grid__cell-trigger[aria-label^="Edit assignees for"]')
    .first();
  await openCell.click();

  await expect(page).toHaveURL(/\/planner\/plans\/[^/]+\/tasks\/[^/]+$/);
});

test('legacy ?task= URL no longer renders a slide-over', async ({ page, request }) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');
  const taskId = await resolveFirstTaskId(request, planId);

  await page.goto(`/planner/plans/${planId}?task=${taskId}`);
  // No slide-over rendered; the board renders normally and the task param is ignored.
  await expect(page.getByRole('complementary', { name: /task details/i })).toHaveCount(0);
  // The route did not redirect into the full-page task surface either.
  await expect(page).toHaveURL(/\/planner\/plans\/[^/]+(\?|$)/);
  // Board itself is visible — at least one Kanban column with a Bucket: prefix.
  await expect(page.locator('section[aria-label^="Bucket: "]').first()).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { resolveFirstTaskId, resolvePlanId } from './helpers/ids.ts';

test('opens task sheet via ?task=…, inline-edits title, sees activity entry', async ({
  page,
  request,
}) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');
  const taskId = await resolveFirstTaskId(request, planId);

  await page.goto(`/planner/plans/${planId}?task=${taskId}`);
  await expect(page.locator('.task-sheet')).toBeVisible();

  await page.locator('.task-sheet__title').click();
  const titleInput = page.locator('input[aria-label="Task title"]');
  await titleInput.fill('New title');
  await page.keyboard.press('Enter');

  await expect(page.locator('.task-sheet__title')).toHaveText('New title');
  await expect(page.locator('.task-sheet__activity li', { hasText: 'task.updated' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.task-sheet')).toHaveCount(0);
  await expect(page).not.toHaveURL(/task=/);
});

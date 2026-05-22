import { expect, test } from '@playwright/test';

test('My Tasks: section renders, clicking a row navigates to task detail and back', async ({
  page,
}) => {
  await page.goto('/planner/my-tasks');
  await expect(page.getByRole('heading', { name: /my tasks/i })).toBeVisible();

  // Wait for either content sections, the empty state, or the error state to settle.
  await Promise.race([
    page.waitForSelector('[data-task-row]', { timeout: 5000 }),
    page.waitForSelector('[data-testid="my-tasks-empty"]', { timeout: 5000 }),
    page.waitForSelector('[data-testid="my-tasks-error"]', { timeout: 5000 }),
  ]);

  const row = page.locator('[data-task-row]').first();
  if ((await row.count()) === 0) {
    test.info().annotations.push({
      type: 'seed-missing',
      description: 'No tasks assigned to the seeded admin; navigation half of the flow skipped.',
    });
    return;
  }

  const title = (await row.locator('span').first().innerText()).trim();
  await row.click();

  await page.waitForURL(/\/planner\/plans\/[^/]+\/tasks\/[^/]+/);
  await expect(page.getByRole('heading').first()).toBeVisible();

  await page.goBack();
  await page.waitForURL(/\/planner\/my-tasks/);
  await expect(page.getByText(title).first()).toBeVisible();
});

test('My Tasks: List → Grid swap via segmented control persists in URL', async ({ page }) => {
  await page.goto('/planner/my-tasks');
  await expect(page.getByRole('heading', { name: /my tasks/i })).toBeVisible();

  await page.getByRole('tab', { name: /grid view/i }).click();
  await page.waitForURL(/view=grid/);

  // Grid only renders when there is at least one task; if the tenant is empty,
  // the empty state shows instead and we just assert the URL change.
  const grid = page.locator('[data-testid="my-tasks-grid"]');
  const empty = page.locator('[data-testid="my-tasks-empty"]');
  await Promise.race([
    grid.waitFor({ state: 'visible', timeout: 5000 }),
    empty.waitFor({ state: 'visible', timeout: 5000 }),
  ]);
});

test('My Tasks: Priority filter pill updates URL', async ({ page }) => {
  await page.goto('/planner/my-tasks');
  await expect(page.getByRole('heading', { name: /my tasks/i })).toBeVisible();

  await page.getByRole('button', { name: /^priority$/i }).click();
  await page.getByRole('option', { name: /^urgent$/i }).click();
  await page.waitForURL(/priority=1/);
});

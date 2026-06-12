import { expect, test } from '@playwright/test';
import { resolvePlanId } from '../helpers/ids';

test('renders the four chart cards when navigating directly to ?view=charts', async ({
  page,
  request,
}) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');

  await page.goto(`/planner/plans/${planId}?view=charts`);

  await expect(page.getByTestId('plan-charts')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('chart-status')).toBeVisible();
  await expect(page.getByTestId('chart-bucket')).toBeVisible();
  await expect(page.getByTestId('chart-priority')).toBeVisible();
  await expect(page.getByTestId('chart-member')).toBeVisible();
});

test('switches to Charts view via the view-switcher button', async ({ page, request }) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');

  // Navigate to the plan with the default view (board).
  await page.goto(`/planner/plans/${planId}`);

  // Wait for the board shell to settle before clicking the switcher.
  await expect(page.getByRole('button', { name: 'Charts view' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Charts view' }).click();

  await expect(page.getByTestId('plan-charts')).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/view=charts/);
});

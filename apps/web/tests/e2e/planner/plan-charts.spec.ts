import { expect, test } from '@playwright/test';
import { resolvePlanId } from '../helpers/ids';

test('renders the dashboard KPIs and default chart cards at ?view=charts', async ({
  page,
  request,
}) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');

  await page.goto(`/planner/plans/${planId}?view=charts`);

  await expect(page.getByTestId('plan-charts')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('plan-charts-summary')).toBeVisible();
  await expect(page.getByTestId('chart-status')).toBeVisible();
  await expect(page.getByTestId('chart-bucket')).toBeVisible();
  await expect(page.getByTestId('chart-priority')).toBeVisible();
  await expect(page.getByTestId('chart-member')).toBeVisible();
});

test('switches to Charts view via the view-switcher button', async ({ page, request }) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');

  await page.goto(`/planner/plans/${planId}`);

  await expect(page.getByRole('button', { name: 'Charts view' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Charts view' }).click();

  await expect(page.getByTestId('plan-charts')).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/view=charts/);
});

test('Customize toggles a hidden chart and persists to the URL', async ({ page, request }) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');

  await page.goto(`/planner/plans/${planId}?view=charts`);
  await expect(page.getByTestId('plan-charts')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('chart-workload')).toHaveCount(0);

  await page.getByRole('button', { name: 'Customize charts' }).click();
  await page.getByText('Team workload').click();

  await expect(page.getByTestId('chart-workload')).toBeVisible();
  await expect(page).toHaveURL(/c\.show=/);
});

test('clicking a status slice opens the Grid view', async ({ page, request }) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');

  await page.goto(`/planner/plans/${planId}?view=charts`);
  await expect(page.getByTestId('chart-status')).toBeVisible({ timeout: 15_000 });

  // The donut side-legend rows are buttons that open those tasks in Grid.
  await page.getByTestId('chart-status').getByRole('button').first().click();
  await expect(page).toHaveURL(/view=grid/);
});

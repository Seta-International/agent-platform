import { expect, request, test } from '@playwright/test';

interface UtilRow {
  worker_id: string;
  full_name: string;
  total_pct: number;
}

let utilRows: UtilRow[] = [];

test.beforeAll(async () => {
  const ctx = await request.newContext({
    baseURL: 'http://localhost:5173',
    storageState: '.auth/admin.json',
  });
  const res = await ctx.get('/api/people/v1/allocation/utilization');
  if (res.ok()) utilRows = ((await res.json()) as { rows: UtilRow[] }).rows;
  await ctx.dispose();
});

test('resource allocation page renders KPIs, grid, and utilization panel', async ({ page }) => {
  await page.goto('/people/allocation');
  await expect(page.getByRole('heading', { name: 'Resource Allocation' })).toBeVisible({
    timeout: 8_000,
  });

  // KPI labels always render.
  await expect(page.getByText('Avg. utilization')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText('Over-allocated')).toBeVisible();

  // Utilization panel header always renders.
  await expect(page.getByRole('heading', { name: 'Utilization by person' })).toBeVisible({
    timeout: 8_000,
  });

  if (utilRows.length === 0) {
    test.skip(true, 'no allocations seeded — backend covered by people integration tests');
    return;
  }
  // A seeded person shows in the panel and drills to their profile.
  const person = utilRows[0]!;
  await expect(page.getByText(person.full_name).first()).toBeVisible({ timeout: 8_000 });
  await page.getByText(person.full_name).first().click();
  await expect(page).toHaveURL(new RegExp(`/people/employees/${person.worker_id}`), {
    timeout: 8_000,
  });
});

test('page-size lists on the allocation screen open fully inside the window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/people/allocation');

  const gridPager = page.getByRole('navigation', { name: 'Allocation pages' });
  await expect(gridPager).toBeVisible({ timeout: 10_000 });

  for (const name of ['Allocation pages', 'Utilization pages']) {
    const pager = page.getByRole('navigation', { name });
    await pager.scrollIntoViewIfNeeded();
    const trigger = pager
      .locator('xpath=..')
      .getByRole('combobox', { name: 'Items per page' })
      .first();
    await trigger.click();

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(page.getByRole('option', { name: '100', exact: true })).toBeVisible();

    const box = await listbox.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);

    await page.keyboard.press('Escape');
  }
});

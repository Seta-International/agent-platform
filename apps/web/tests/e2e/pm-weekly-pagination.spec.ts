import { expect, test } from '@playwright/test';

test('page-size list opens fully inside the window at the bottom of the weekly board', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/pm/weekly');

  const pager = page.getByRole('navigation', { name: 'Weekly report pages' });
  await expect(pager).toBeVisible({ timeout: 10_000 });
  await pager.scrollIntoViewIfNeeded();

  const trigger = page.getByRole('combobox', { name: 'Items per page' });
  await trigger.click();

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(page.getByRole('option', { name: '10', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: '100', exact: true })).toBeVisible();

  const box = await listbox.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

  // The largest page size is reachable, not just painted inside the window.
  await page.getByRole('option', { name: '100', exact: true }).click();
  await expect(pager.getByText(/Page 1 of/)).toBeVisible();
});

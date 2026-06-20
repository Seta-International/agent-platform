import { expect, test } from '@playwright/test';

// Runs as org.admin (wildcard) from global-setup storage state — holds all hiring.* perms.

const TEMPLATE = `E2E Template ${Date.now()}`;
const REASON = `E2E Reason ${Date.now()}`;

test.describe.configure({ mode: 'serial' });

test('admin creates a JD template', async ({ page }) => {
  await page.goto('/hiring/settings');
  await expect(page.getByRole('heading', { name: 'Hiring settings' })).toBeVisible();
  await expect(page.getByText('JD templates')).toBeVisible();

  await page.getByRole('button', { name: 'New template' }).click();
  await expect(page.getByRole('heading', { name: 'New JD template' })).toBeVisible();
  await page.getByPlaceholder('e.g. Backend role').fill(TEMPLATE);
  await page.getByRole('button', { name: 'Create template' }).click();

  await expect(page.getByText('Template created')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(TEMPLATE)).toBeVisible();
});

test('admin creates an opening close-reason', async ({ page }) => {
  await page.goto('/hiring/settings');
  await expect(page.getByRole('heading', { name: 'Hiring settings' })).toBeVisible();
  await expect(page.getByText('Opening close-reasons')).toBeVisible();

  await page.getByRole('button', { name: 'New close reason' }).click();
  await expect(page.getByRole('heading', { name: 'New close reason' })).toBeVisible();
  await page.getByPlaceholder('e.g. Position cancelled').fill(REASON);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByText('Close reason created')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(REASON)).toBeVisible();
});

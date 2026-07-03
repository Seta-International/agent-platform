import { expect, test } from '@playwright/test';

// Runs as org.admin (wildcard) from global-setup storage state — holds all hiring.* perms.

const TITLE = `E2E Requisition ${Date.now()}`;

test.describe.configure({ mode: 'serial' });

test('admin opens a requisition and it appears on the board', async ({ page }) => {
  await page.goto('/hiring/requisitions');
  await expect(page.getByRole('heading', { name: 'Requisitions' })).toBeVisible();

  await page.getByRole('button', { name: 'New requisition' }).click();
  await expect(page.getByRole('heading', { name: 'New requisition' })).toBeVisible();

  await page.getByPlaceholder('e.g. Senior Backend Engineer').fill(TITLE);
  await page.getByPlaceholder('React, TypeScript, AWS').fill('Go, Postgres');
  await page.getByRole('button', { name: 'Create requisition' }).click();

  await expect(page.getByText('Requisition created')).toBeVisible({ timeout: 8_000 });
  // Board (default view) shows the new requisition card title.
  await expect(page.getByRole('button', { name: TITLE })).toBeVisible();
});

test('board↔list toggle keeps the requisition visible', async ({ page }) => {
  await page.goto('/hiring/requisitions');
  await expect(page.getByRole('button', { name: TITLE })).toBeVisible();

  // Switch to List — SegmentedControl renders role="tab" inside role="tablist".
  await page.getByRole('tab', { name: 'List' }).click();
  await page.getByPlaceholder('Search requisitions…').fill(TITLE);
  await expect(page.getByText(TITLE)).toBeVisible();

  // Switch back to Board.
  await page.getByRole('tab', { name: 'Board' }).click();
  await expect(page.getByRole('button', { name: TITLE })).toBeVisible();
});

test('opening the requisition detail shows the JD modal', async ({ page }) => {
  await page.goto('/hiring/requisitions');
  await page.getByRole('button', { name: TITLE }).click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('heading', { name: TITLE })).not.toBeVisible();
});

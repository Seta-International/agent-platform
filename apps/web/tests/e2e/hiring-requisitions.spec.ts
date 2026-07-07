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
  await page
    .getByPlaceholder('One short paragraph on the role and its context…')
    .fill('Own the platform roadmap and mentor the team.');
  // Tech stack is optional and SkillPicker now opens via an "Add skill" button + command
  // palette rather than a directly-fillable input — pre-existing drift, tracked separately.
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

test('card lifecycle: advance stage, pause/resume, then cancel with a reason', async ({ page }) => {
  // Self-contained: don't depend on hiring-settings.spec.ts having run first / in the same
  // worker — create the close reason this test needs directly.
  const REASON = `E2E Cancel Reason ${Date.now()}`;
  await page.goto('/hiring/settings');
  await page.getByRole('button', { name: 'New close reason' }).click();
  await page.getByPlaceholder('e.g. Position cancelled').fill(REASON);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Close reason created')).toBeVisible({ timeout: 8_000 });

  await page.goto('/hiring/requisitions');
  const card = page.getByTestId('requisition-card').filter({ hasText: TITLE });
  // Status is a plain (non-interactive) label — the "•••" button is the lifecycle-menu trigger.
  const menuButton = card.getByRole('button', { name: 'Requisition actions' });

  // Advancing the stage track doesn't touch status.
  await card.getByRole('button', { name: 'Screening' }).click();
  await expect(card.getByText('Open', { exact: true })).toBeVisible();

  // Pause via the lifecycle menu — stage is preserved, status flips to On hold.
  await menuButton.click();
  await page.getByRole('menuitem', { name: 'Pause' }).click();
  await expect(card.getByText('On hold', { exact: true })).toBeVisible();

  // On hold locks the stage track — no implicit resume-on-click. Advancing the stage
  // requires an explicit Resume first.
  await expect(card.getByRole('button', { name: 'Interview' })).toBeDisabled();
  await menuButton.click();
  await page.getByRole('menuitem', { name: 'Resume' }).click();
  await expect(card.getByText('Open', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Interview' }).click();

  // Cancelling requires picking a reason.
  await menuButton.click();
  await page.getByRole('menuitem', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Cancel requisition' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel requisition', exact: true }).click();

  await expect(page.getByText('Requisition cancelled')).toBeVisible({ timeout: 8_000 });
  // The open-positions board only carries open|on_hold requisitions (see
  // OPEN_BOARD_STATUSES in read-requisitions.ts) — cancelling removes the card entirely
  // rather than leaving it showing a "Cancelled" badge.
  await expect(card).toHaveCount(0);
});

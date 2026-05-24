// Pre-req: Playwright runner is provisioned in a separate slice. Until then this file documents
// the W3 re-run side-sheet contract introduced in the workflow-runs polish PR.
import { expect, test } from '@playwright/test';

test('re-run a terminal run with edited inputs creates a new run', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'demo@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  // Land on a terminal (success) run via the inbox.
  await page.goto('/copilot/workflows');
  await page.locator('[aria-label="status: success"]').first().waitFor({ timeout: 15_000 });
  await page.locator('a:has-text("new-task-skill-tag")').first().click();

  // Open the re-run side sheet (run-header button is "Replay from start" after PR2 rename).
  await page.getByRole('button', { name: /Replay from start/ }).click();
  await expect(page.getByRole('heading', { name: /Re-run workflow/i })).toBeVisible();

  // Schema-driven form is pre-filled from the prior run's inputSummary; submit unchanged.
  await page.getByRole('button', { name: 'Re-run' }).click();

  // URL navigates to the new run; live status badge shows running/paused/success quickly.
  await expect(page).toHaveURL(/\/copilot\/workflows\/runs\/[a-f0-9-]+$/);
  await expect(
    page.locator(
      '[aria-label="status: running"], [aria-label="status: paused"], [aria-label="status: success"]',
    ),
  ).toBeVisible({ timeout: 10_000 });
});

test('replay-from-step opens sheet pre-filled with the chosen step payload and navigates to a new run', async ({
  page,
}) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'demo@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  await page.goto('/copilot/workflows');
  await page.locator('[aria-label="status: success"]').first().waitFor({ timeout: 15_000 });
  await page.locator('a:has-text("new-task-skill-tag")').first().click();

  // Per-step affordance lives on every terminal step in a terminal run.
  const replayButtons = page.getByRole('button', { name: 'Replay from here' });
  await replayButtons.first().waitFor({ timeout: 10_000 });
  await replayButtons.nth(0).click();

  // Banner identifies the replay-from-step intent; sheet renders with that step's prior input.
  await expect(page.getByText(/Replaying from step/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Replay from step/i })).toBeVisible();

  // Submit unmodified — should still reach the new run.
  await page.getByRole('button', { name: 'Replay from step' }).click();
  await expect(page).toHaveURL(/\/copilot\/workflows\/runs\/[a-f0-9-]+$/);
});

test('replay-from-step shows `was: <prior>` strikethrough when the user edits a field', async ({
  page,
}) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'demo@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  await page.goto('/copilot/workflows');
  await page.locator('a:has-text("new-task-skill-tag")').first().click();
  await page.getByRole('button', { name: 'Replay from here' }).first().click();

  const uuidInput = page.getByLabel('taskRef › taskId');
  await uuidInput.fill('22222222-2222-2222-2222-222222222222');
  await expect(page.getByText(/was: /i)).toBeVisible();
});

test('invalid input in the re-run side sheet blocks submit', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'demo@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  await page.goto('/copilot/workflows');
  await page.locator('a:has-text("new-task-skill-tag")').first().click();
  await page.getByRole('button', { name: /Replay from start/ }).click();

  // Replace the uuid leaf with garbage.
  const uuidInput = page.getByLabel('taskRef › taskId');
  await uuidInput.fill('not-a-uuid');
  await page.getByRole('button', { name: 'Re-run' }).click();

  // Validation message renders; no navigation.
  await expect(page.getByText(/must be a UUID/i)).toBeVisible();
  await expect(page).toHaveURL(/\/rerun=1/);
});

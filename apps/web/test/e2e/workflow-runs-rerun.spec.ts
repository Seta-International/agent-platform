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

  // Open the re-run side sheet.
  await page.getByRole('button', { name: /Re-run/ }).click();
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

test('invalid input in the re-run side sheet blocks submit', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'demo@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  await page.goto('/copilot/workflows');
  await page.locator('a:has-text("new-task-skill-tag")').first().click();
  await page.getByRole('button', { name: /Re-run/ }).click();

  // Replace the uuid leaf with garbage.
  const uuidInput = page.getByLabel('taskRef › taskId');
  await uuidInput.fill('not-a-uuid');
  await page.getByRole('button', { name: 'Re-run' }).click();

  // Validation message renders; no navigation.
  await expect(page.getByText(/must be a UUID/i)).toBeVisible();
  await expect(page).toHaveURL(/\/rerun=1/);
});

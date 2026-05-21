// Pre-req: Playwright runner is provisioned in a separate slice. Until then this file documents
// the flagship workflow-runs demo flow contract introduced in the workflow-runs feature PR.
import { expect, test } from '@playwright/test';

test('flagship demo: create task → run appears → approve → assigned', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'demo@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  // Create a task in the planner — the planner.task.created event auto-triggers the workflow.
  await page.goto('/planner');
  await page
    .getByRole('button', { name: /New task/ })
    .first()
    .click();
  await page.getByLabel(/Title/).fill('Tune Postgres write throughput');
  await page.getByLabel(/Description/).fill('Tail latency spikes during peak writes');
  await page.getByRole('button', { name: /Create task|Create/ }).click();

  // Switch to Workflows and confirm a run row appears within seconds.
  await page.goto('/copilot/workflows');
  await expect(page.getByText('new-task-skill-tag')).toBeVisible({ timeout: 10_000 });

  // Open the run; it should be paused awaiting HITL approval.
  await page.locator('a:has-text("new-task-skill-tag")').first().click();
  await expect(page.getByRole('status', { name: /paused/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: /approval needed/i })).toBeVisible();

  // Approve — status flips to success.
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status', { name: /success/i })).toBeVisible({ timeout: 10_000 });

  // Verify the assignment landed in the planner.
  await page.goto('/planner');
  await page.getByText('Tune Postgres write throughput').click();
  await expect(page.getByText(/assigned to/i)).toBeVisible();
});

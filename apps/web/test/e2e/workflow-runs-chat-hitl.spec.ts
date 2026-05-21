// Pre-req: Playwright runner is provisioned in a separate slice. Until then this file documents
// the chat-embedded HITL contract introduced in the workflow-runs polish PR.
import { expect, test } from '@playwright/test';

test('chat-embedded HITL: ask supervisor → approval card appears in thread → approve', async ({
  page,
}) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'demo@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  // Create a task we can target by id.
  await page.goto('/planner');
  await page
    .getByRole('button', { name: /New task/ })
    .first()
    .click();
  await page.getByLabel(/Title/).fill('Refactor sse-inbox tests');
  await page.getByRole('button', { name: /Create task|Create/ }).click();
  const taskCard = page.getByText('Refactor sse-inbox tests').first();
  await taskCard.click();
  const taskId = await page.getAttribute('[data-task-id]', 'data-task-id');
  expect(taskId).toBeTruthy();

  // Ask the supervisor to find an assignee.
  await page.goto('/copilot/chat');
  await page.getByPlaceholder(/Ask anything|Message/).fill(`Find an assignee for task ${taskId}.`);
  await page.keyboard.press('Enter');

  // The embedded HITL card appears once the workflow reaches the await-approval step.
  await expect(page.getByRole('region', { name: /approval needed/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Approve' }).click();

  // Card vanishes; the next supervisor reply mentions completion.
  await expect(page.getByRole('region', { name: /approval needed/i })).toHaveCount(0, {
    timeout: 10_000,
  });
});

test('chat-embedded HITL only renders for the current thread', async ({ page }) => {
  // Approvals whose surfaceChatThreadId points at thread A must not appear when viewing thread B.
  await page.goto('/login');
  await page.fill('[name=email]', 'demo@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  // Open a different thread (any other existing thread).
  await page.goto('/copilot/chat?thread=other-thread-id');
  await expect(page.getByRole('region', { name: /approval needed/i })).toHaveCount(0);
});

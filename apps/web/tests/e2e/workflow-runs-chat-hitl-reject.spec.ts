// Mirror of workflow-runs-chat-hitl.spec.ts for the reject path. Together they document the
// symmetric HITL contract: approve dismisses the card and the workflow proceeds; reject dismisses
// the card, records decision='reject', and does not apply the proposed mutation.
import { expect, test } from '@playwright/test';

test('chat-embedded HITL: ask supervisor → approval card appears in thread → reject', async ({
  page,
}) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'demo@seta.local');
  await page.fill('[name=password]', 'demo-pass');
  await page.click('button[type=submit]');

  await page.goto('/planner');
  await page
    .getByRole('button', { name: /New task/ })
    .first()
    .click();
  await page.getByLabel(/Title/).fill('Reject HITL skill-tag proposal');
  await page.getByRole('button', { name: /Create task|Create/ }).click();
  const taskCard = page.getByText('Reject HITL skill-tag proposal').first();
  await taskCard.click();
  const taskId = await page.getAttribute('[data-task-id]', 'data-task-id');
  expect(taskId).toBeTruthy();

  await page.goto('/copilot/chat');
  await page.getByPlaceholder(/Ask anything|Message/).fill(`Find an assignee for task ${taskId}.`);
  await page.keyboard.press('Enter');

  // Approval card appears once the workflow reaches the await-approval step.
  const card = page.getByRole('region', { name: /approval needed/i });
  await expect(card).toBeVisible({ timeout: 30_000 });

  // Reject is a two-step interaction: open the reject panel, then confirm.
  await page.getByRole('button', { name: 'Reject' }).click();
  await page.getByRole('button', { name: /confirm reject/i }).click();

  // Card vanishes; the supervisor reply confirms no assignee was applied.
  await expect(card).toHaveCount(0, { timeout: 10_000 });

  // Post-condition: the task assignee remains unset (the proposed mutation was not applied).
  await page.goto('/planner');
  await page.getByText('Reject HITL skill-tag proposal').first().click();
  await expect(page.getByText(/Unassigned/i)).toBeVisible();
});

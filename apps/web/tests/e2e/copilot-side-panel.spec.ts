import { expect, test } from '@playwright/test';
import { signInAsAdmin } from './helpers/auth';
import { resolveFirstTaskId, resolvePlanId } from './helpers/ids';

test.describe('Copilot side panel', () => {
  test('attaches planner.task context when a task detail page is open', async ({
    page,
    request,
  }) => {
    await signInAsAdmin(request);
    const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');
    const taskId = await resolveFirstTaskId(request, planId);

    await page.goto(`/planner/plans/${planId}/tasks/${taskId}`);
    // Wait for the task title to render so useCopilotContext has fired.
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    const taskTitle = (await heading.textContent())?.trim() ?? '';
    expect(taskTitle.length).toBeGreaterThan(0);

    // Open the copilot side panel (Meta+\ on macOS, Control+\ everywhere else).
    await page.keyboard.press('Meta+\\');

    // The context chip appears above the composer with the task title and a detach affordance.
    const chipLabel = page
      .locator('[aria-label="Detach context"]')
      .first()
      .locator('..')
      .getByText(/planner\.task/);
    await expect(chipLabel).toBeVisible({ timeout: 5_000 });

    // Detaching the chip hides it for this thread until the user starts another one.
    await page.getByRole('button', { name: /detach context/i }).click();
    await expect(page.getByRole('button', { name: /detach context/i })).toHaveCount(0);
  });

  // NOTE: the streaming "send → badge persists" assertion lives in unit + integration tests
  // (data-page-context part injection / round-trip). Wiring it through Playwright would
  // require a live model and a deterministic agent reply; the chip-detach flow above is
  // the user-observable contract that this PR is on the hook for.
});

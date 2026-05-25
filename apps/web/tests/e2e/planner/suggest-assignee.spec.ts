// End-to-end coverage for PR3 §4.2 (Suggest button → workflow REST → inbox)
// and §5.8 (chat-vs-button coexistence via pending_assign_workflow_run_id).
//
// Prereq: full dev stack reachable + sandbox tenant seeded. The Suggest
// workflow's first step calls the embedding provider, so OPENAI_API_KEY (or a
// stubbed embedder) must be set in the dev env for the happy path.
import { expect, test } from '@playwright/test';
import { resolveFirstTaskId, resolvePlanId } from '../helpers/ids';

test('Suggest button posts to REST and surfaces the run via the inbox toast', async ({
  page,
  request,
}) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');
  const taskId = await resolveFirstTaskId(request, planId);

  // Ensure the task has no assignees so the Suggest button renders.
  await request.put(`/api/planner/v1/tasks/${taskId}/assignees`, {
    data: { assignees: [] },
  });

  // Capture the workflow-start POST so we can assert the contract.
  const startReq = page.waitForRequest(
    (r) =>
      r.url().endsWith('/api/copilot/v1/workflows/runs/assignBySkill/start') &&
      r.method() === 'POST',
  );
  const startResp = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/copilot/v1/workflows/runs/assignBySkill/start') &&
      r.request().method() === 'POST',
  );

  await page.goto(`/planner/plans/${planId}/tasks/${taskId}`);
  await page.getByRole('button', { name: /Suggest assignee/i }).click();

  const req = await startReq;
  expect(req.postDataJSON()).toMatchObject({ taskId });
  const resp = await startResp;
  expect(resp.status()).toBe(200);
  const body = (await resp.json()) as { runId: string };
  expect(body.runId).toMatch(/^[0-9a-f-]{36}$/);

  await expect(page.getByText(/Suggest started/i)).toBeVisible();
  const inboxLink = page.getByRole('button', { name: /Open in inbox/i });
  await expect(inboxLink).toBeVisible();
  await inboxLink.click();
  await page.waitForURL(new RegExp(`/copilot/workflows/runs/${body.runId}`));
});

test('task card shows the in-progress link when a Suggest run is already pending', async ({
  page,
  request,
}) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');
  const taskId = await resolveFirstTaskId(request, planId);
  await request.put(`/api/planner/v1/tasks/${taskId}/assignees`, {
    data: { assignees: [] },
  });

  // Start a Suggest run by clicking the button once. The workflow's
  // first step may fail without an embedding provider, but the
  // workflow_runs row is written at run-started (before any step
  // executes) so pending_assign_workflow_run_id resolves on re-fetch.
  await page.goto(`/planner/plans/${planId}/tasks/${taskId}`);
  await page.getByRole('button', { name: /Suggest assignee/i }).click();
  await expect(page.getByText(/Suggest started/i)).toBeVisible();

  // Re-load the detail page so the task query refetches and sees the
  // pending workflow run.
  await page.reload();
  const link = page.getByTestId('suggest-in-progress-link');
  await expect(link).toBeVisible();
  await expect(link).toContainText(/Suggest in progress/i);
});

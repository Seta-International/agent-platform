import { expect, test } from '@playwright/test';
import { resolveFirstTaskId, resolvePlanId } from '../helpers/ids';

test('task detail full edit flow', async ({ page, request }) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');
  const taskId = await resolveFirstTaskId(request, planId);

  // Capture every PATCH the page fires against this task; we assert the
  // tail of fields landed on the wire at the end of the flow.
  const patchBodies: Array<Record<string, unknown>> = [];
  await page.route(`**/api/planner/v1/tasks/${taskId}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      try {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        patchBodies.push(body);
      } catch {
        // Non-JSON bodies aren't part of the contract we're verifying here.
      }
    }
    await route.fallback();
  });

  await page.goto(`/planner/plans/${planId}/tasks/${taskId}`);

  // Header heading uses the seeded title; we don't assume a specific string.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Progress: focus the Radix slider thumb and step right several times.
  const thumb = page.getByRole('slider', { name: 'Percent complete' });
  await thumb.focus();
  for (let i = 0; i < 20; i++) await thumb.press('ArrowRight');

  // Priority: Urgent (priority_number = 1)
  await page.getByRole('button', { name: /^Urgent$/ }).click();

  // Schedule: Start + Due
  await page.getByLabel('Start').fill('2026-08-12');
  await page.getByLabel('Due').fill('2026-08-20');

  // Add a reference by pasting a URL.
  const refInput = page.getByPlaceholder(/Paste a URL/);
  await refInput.fill('https://acme.sharepoint.com/Shared/Doc.xlsx');
  await refInput.press('Enter');
  await expect(page.getByText('Doc.xlsx').first()).toBeVisible();

  // Checklist drag-reorder via @hello-pangea/dnd keyboard-accessible path.
  // The handle is rendered with aria-label="Drag handle" per shared-ui.
  const dragHandles = page.getByRole('button', { name: 'Drag handle' });
  if ((await dragHandles.count()) >= 2) {
    await dragHandles.first().focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
  }

  // External rail card: link button is disabled in this PR.
  const linkBtn = page.getByRole('button', { name: /Link to MS Planner task/i });
  await expect(linkBtn).toBeDisabled();

  // Wait for outbound PATCHes to settle, then assert each touched field landed.
  await page.waitForLoadState('networkidle');
  const merged = Object.assign({}, ...patchBodies) as Record<string, unknown>;
  expect(merged.priority_number).toBe(1);
  expect(typeof merged.percent_complete === 'number').toBe(true);
  expect(merged.start_at).toBeTruthy();
  expect(merged.due_at).toBeTruthy();
});

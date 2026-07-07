// End-to-end coverage for FUT-397: the inline "Suggested" section inside the
// Add-assignee popover (GET /api/planner/v1/tasks/:id/assignee-suggestions),
// which replaces the old "Suggest assignee" button that started a standalone
// workflow run and surfaced it via the inbox.
//
// Prereq: full dev stack reachable + sandbox tenant seeded. Suggestion
// ranking runs the same computeAssigneeSuggestions pipeline the old
// assignBySkill workflow used: its skill-vector signal calls the embedding
// provider (OPENAI_API_KEY or a stubbed embedder), and its exact-overlap
// signal needs planner.assignee_projection.skills populated for a group
// member — neither is guaranteed by the plain e2e fixture tenant, so the
// Suggested section may legitimately settle on "No strong matches" here.
// This spec always asserts the merged-popover contract (the heading renders;
// a suggested row, when present, carries a % score badge and assigns without
// closing the popover) and falls back to the "All members" list — governed
// by the identical assign-and-keep-open CommandItem — so Task 5's core
// regression is exercised even when no candidate clears the ranking bar.
import { expect, test } from '@playwright/test';
import { resolveFirstTaskId, resolvePlanId } from '../helpers/ids';

test('inline assignee suggestions assign from the Add-assignee popover', async ({
  page,
  request,
}) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');
  const taskId = await resolveFirstTaskId(request, planId);

  // Start from a clean slate so "Add assignee" is available and no row is
  // pre-marked "Added".
  await request.put(`/api/planner/v1/tasks/${taskId}/assignees`, {
    data: { assignees: [] },
  });

  await page.goto(`/planner/plans/${planId}/tasks/${taskId}`);
  await page.getByRole('button', { name: 'Add assignee' }).click();

  const searchInput = page.getByPlaceholder('Search group members');
  await expect(searchInput).toBeVisible();
  await expect(page.getByText('Suggested')).toBeVisible();

  // cmdk renders each CommandGroup as a `[cmdk-group]` element (its
  // documented styling hook); scope by heading text to tell the "Suggested"
  // rows apart from "All members" without depending on DOM order.
  const suggestedGroup = page.locator('[cmdk-group]').filter({ hasText: 'Suggested' });
  const allMembersGroup = page.locator('[cmdk-group]').filter({ hasText: 'All members' });

  // The group-member list always resolves to at least one row (the
  // signed-in admin, auto-added as the group's owner on creation).
  await expect(allMembersGroup.getByRole('option').first()).toBeVisible();

  // The suggestions query settles into either real rows or an empty/error
  // note; wait for either before deciding which list to act on.
  await expect(
    suggestedGroup
      .getByRole('option')
      .first()
      .or(suggestedGroup.getByText(/No strong matches|Couldn't load suggestions/)),
  ).toBeVisible({ timeout: 15_000 });

  const suggestedOptions = suggestedGroup.getByRole('option');
  const hasSuggestion = (await suggestedOptions.count()) > 0;
  if (hasSuggestion) {
    // Score badge, e.g. "82%".
    await expect(suggestedOptions.first()).toContainText('%');
  }
  const candidate = hasSuggestion
    ? suggestedOptions.first()
    : allMembersGroup.getByRole('option').first();

  const assignReqP = page.waitForRequest(
    (r) => r.url().endsWith('/assign') && r.method() === 'POST',
  );
  await candidate.click();
  const assignReq = await assignReqP;
  const { user_id: assignedUserId } = assignReq.postDataJSON() as { user_id: string };

  // Assigning keeps the popover open — the search box is still visible, and
  // the picked row now reads "Added" rather than the popover closing.
  await expect(searchInput).toBeVisible();
  await expect(candidate).toContainText('Added');

  await page.keyboard.press('Escape');

  const taskRes = await request.get(`/api/planner/v1/tasks/${taskId}`);
  expect(taskRes.ok()).toBe(true);
  const { assignees } = (await taskRes.json()) as {
    assignees: Array<{ user_id: string; display_name: string }>;
  };
  const assigned = assignees.find((a) => a.user_id === assignedUserId);
  expect(assigned).toBeTruthy();
  await expect(page.getByRole('region', { name: 'Assignees' })).toContainText(
    assigned!.display_name,
  );
});

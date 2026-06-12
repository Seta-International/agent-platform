import { type APIRequestContext, expect, test } from '@playwright/test';
import { resolveGroupId, resolvePlanId, resolveTaskId } from '../helpers/ids';

interface BucketRow {
  id: string;
  name: string;
}
interface TaskDetail {
  id: string;
  title: string;
  bucket_id: string | null;
  version: number;
}

async function getJson<T>(request: APIRequestContext, url: string): Promise<T> {
  const res = await request.get(url);
  if (!res.ok()) throw new Error(`${url} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

// Proves both acceptance-criteria gaps at once: the column move renders in plain
// language with from->to bucket names, and it appears in the feed live (no reload).
test('activity tab shows a live column move with from->to bucket names', async ({
  page,
  request,
}) => {
  const groupId = await resolveGroupId(request, 'Engineering');
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');

  const { buckets } = await getJson<{ buckets: BucketRow[] }>(
    request,
    `/api/planner/v1/plans/${planId}/buckets`,
  );
  const todo = buckets.find((b) => b.name === 'To do');
  const inProgress = buckets.find((b) => b.name === 'In progress');
  expect(todo, 'fixture bucket "To do"').toBeTruthy();
  expect(inProgress, 'fixture bucket "In progress"').toBeTruthy();
  if (!todo || !inProgress) return;

  const taskId = await resolveTaskId(request, planId, 'Set up CI/CD pipeline');
  let detail = await getJson<TaskDetail>(request, `/api/planner/v1/tasks/${taskId}`);

  // Normalise the starting column to "To do" so the asserted move is To do -> In progress
  // (idempotent across repeated runs that may have left the task elsewhere).
  if (detail.bucket_id !== todo.id) {
    const res = await request.post(`/api/planner/v1/tasks/${taskId}/move`, {
      data: { expected_version: detail.version, bucket_id: todo.id },
    });
    expect(res.ok()).toBeTruthy();
    detail = await getJson<TaskDetail>(request, `/api/planner/v1/tasks/${taskId}`);
  }

  // Open the Activity tab BEFORE the move so the new row can only arrive via live update.
  await page.goto(`/planner/groups/${groupId}`);
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByText('All events · live')).toBeVisible();

  // Trigger the column move via the API (To do -> In progress).
  const moveRes = await request.post(`/api/planner/v1/tasks/${taskId}/move`, {
    data: { expected_version: detail.version, bucket_id: inProgress.id },
  });
  expect(moveRes.ok()).toBeTruthy();

  // The live feed shows the plain-language label without a page reload.
  await expect(
    page.getByText('moved "Set up CI/CD pipeline" from To do to In progress'),
  ).toBeVisible({ timeout: 10_000 });
});

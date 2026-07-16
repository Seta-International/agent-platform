// Pre-req: Playwright runner is provisioned in a separate slice. When that lands, this file is wired into
// `pnpm --filter @seta/web test:e2e`. Until then it documents the live-SSE contract.
import { expect, test } from '@playwright/test';

test('two browser contexts: drag a card; observer sees the move within 100 ms with the recently-moved flash state', async ({
  browser,
}) => {
  const [ctxA, ctxB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [a, b] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);

  // Fixtures come from apps/web/tests/e2e/helpers/fixtures.ts (Engineering / Q2 Infrastructure).
  await a.goto('/login');
  await b.goto('/login');

  await a.goto('/planner/plans/<seeded-plan-id>');
  await b.goto('/planner/plans/<seeded-plan-id>');

  // Cards are role=button with an `aria-label` of `Task: <title>`; columns are
  // role=region labelled `Bucket: <name>`; the droppable card list inside a column is
  // the element carrying @hello-pangea/dnd's `data-rfd-droppable-id`.
  const taskTitle = 'Ship M3 spec';
  const cardA = a.locator('[role="button"][aria-label^="Task: "]', { hasText: taskTitle });
  const cardB = b.locator('[role="button"][aria-label^="Task: "]', { hasText: taskTitle });
  await expect(cardA).toBeVisible();
  await expect(cardB).toBeVisible();

  // @hello-pangea/dnd uses HTML5 drag events; Playwright's dragTo drives them natively.
  const start = Date.now();
  await cardA.dragTo(
    a.locator('[role="region"][aria-label="Bucket: Done"] [data-rfd-droppable-id]').first(),
  );

  await expect(
    b.locator('[role="region"][aria-label="Bucket: Done"] [role="button"][aria-label^="Task: "]', {
      hasText: taskTitle,
    }),
  ).toBeVisible({ timeout: 1500 });

  const flashed = await b
    .locator('[role="button"][aria-label^="Task: "][data-recently-moved="true"]', {
      hasText: taskTitle,
    })
    .count();
  expect(flashed).toBeGreaterThan(0);
  expect(Date.now() - start).toBeLessThan(3000);

  await ctxA.close();
  await ctxB.close();
});

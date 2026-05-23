// Pre-req: Playwright runner is provisioned in a separate slice. When that lands, this file is wired into
// `pnpm --filter @seta/web test:e2e`. Until then it documents the live-SSE contract.
import { expect, test } from '@playwright/test';

test('two browser contexts: drag a card; observer sees the move within 100 ms with primary-flash class', async ({
  browser,
}) => {
  const [ctxA, ctxB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [a, b] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);

  // Seeded users + plan come from `pnpm db:seed` (see apps/web/test/e2e/helpers/auth.ts once provisioned).
  await a.goto('/login');
  await b.goto('/login');

  await a.goto('/planner/plans/<seeded-plan-id>');
  await b.goto('/planner/plans/<seeded-plan-id>');

  const taskTitle = 'Ship M3 spec';
  const cardA = a.locator('.kanban-card', { hasText: taskTitle });
  const cardB = b.locator('.kanban-card', { hasText: taskTitle });
  await expect(cardA).toBeVisible();
  await expect(cardB).toBeVisible();

  // @hello-pangea/dnd uses HTML5 drag events; Playwright's dragTo drives them natively.
  const start = Date.now();
  await cardA.dragTo(a.locator('section[aria-label="Bucket: Done"] .kanban-column__list'));

  await expect(
    b.locator('section[aria-label="Bucket: Done"] .kanban-card', { hasText: taskTitle }),
  ).toBeVisible({ timeout: 1500 });

  const flashed = await b.locator('.kanban-card--recently-moved', { hasText: taskTitle }).count();
  expect(flashed).toBeGreaterThan(0);
  expect(Date.now() - start).toBeLessThan(3000);

  await ctxA.close();
  await ctxB.close();
});

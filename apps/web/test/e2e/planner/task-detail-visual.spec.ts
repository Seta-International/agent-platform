import { expect, test } from '@playwright/test';
import { resolveFirstTaskId, resolvePlanId } from '../helpers/ids';

// Baseline PNGs are generated via `pnpm --filter @seta/web test:e2e -- task-detail-visual --update-snapshots`
// against a running dev server. They live under apps/web/test/e2e/planner/task-detail-visual.spec.ts-snapshots/.
for (const theme of ['light', 'dark'] as const) {
  test(`task detail visual — ${theme}`, async ({ page, request }) => {
    const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');
    const taskId = await resolveFirstTaskId(request, planId);
    await page.emulateMedia({ colorScheme: theme === 'dark' ? 'dark' : 'light' });
    await page.goto(`/planner/plans/${planId}/tasks/${taskId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page).toHaveScreenshot(`task-detail-${theme}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test(`categories settings visual — ${theme}`, async ({ page, request }) => {
    const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');
    await page.emulateMedia({ colorScheme: theme === 'dark' ? 'dark' : 'light' });
    await page.goto(`/planner/plans/${planId}/settings/categories`);
    await expect(page.getByRole('heading', { level: 1, name: /settings/i })).toBeVisible();
    await expect(page).toHaveScreenshot(`categories-settings-${theme}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
}

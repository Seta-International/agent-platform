import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`/planner/my-tasks visual regression (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/planner/my-tasks');
    await page.waitForLoadState('networkidle');

    await Promise.race([
      page.waitForSelector('[data-section]', { timeout: 5000 }),
      page.waitForSelector('[data-testid="my-tasks-empty"]', { timeout: 5000 }),
      page.waitForSelector('[data-testid="my-tasks-error"]', { timeout: 5000 }),
    ]);

    await expect(page).toHaveScreenshot(`my-tasks-${theme}.png`, {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });
}

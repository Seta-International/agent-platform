import { expect, test } from '@playwright/test';
import { signInAsAdmin } from './helpers/auth';
import { resolveFirstTaskId, resolvePlanId } from './helpers/ids';

test.describe('Agent side panel', () => {
  test('attaches planner.task context when a task detail page is open', async ({
    page,
    request,
  }) => {
    await signInAsAdmin(request);
    const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');
    const taskId = await resolveFirstTaskId(request, planId);

    await page.goto(`/planner/plans/${planId}/tasks/${taskId}`);
    // Wait for the task title to render so useAgentContext has fired.
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    const taskTitle = (await heading.textContent())?.trim() ?? '';
    expect(taskTitle.length).toBeGreaterThan(0);

    // Open the agent side panel (Meta+\ on macOS, Control+\ everywhere else).
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

  test('docked panel resizes from the left grip, persists width, and fills column height', async ({
    page,
    request,
  }) => {
    await signInAsAdmin(request);
    // Wide viewport so the docked aside (lg:flex) renders instead of the mobile sheet.
    await page.setViewportSize({ width: 1440, height: 900 });
    const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');
    await page.goto(`/planner/plans/${planId}`);

    // Open the agent side panel (Meta+\ on macOS, Control+\ everywhere else).
    await page.keyboard.press('Meta+\\');
    const aside = page.getByRole('complementary', { name: 'Agent' });
    await expect(aside).toBeVisible();

    // Height: the panel fills (nearly) the full viewport column, not collapsed to content.
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('viewport size unavailable');
    const firstBox = await aside.boundingBox();
    if (!firstBox) throw new Error('agent panel has no box');
    expect(firstBox.height).toBeGreaterThanOrEqual(viewport.height * 0.9);

    // Drag the left grip further left → the right-docked panel widens.
    const grip = page.getByRole('separator', { name: 'Resize agent panel' });
    const gripBox = await grip.boundingBox();
    if (!gripBox) throw new Error('resize grip has no box');
    const widthBefore = firstBox.width;
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(gripBox.x - 80, gripBox.y + gripBox.height / 2, { steps: 10 });
    await page.mouse.up();

    const draggedBox = await aside.boundingBox();
    if (!draggedBox) throw new Error('agent panel has no box after drag');
    const widthAfter = draggedBox.width;
    expect(widthAfter).toBeGreaterThan(widthBefore + 40);

    // Width survives a reload (persisted to localStorage), even though open-state does not.
    await page.reload();
    await page.keyboard.press('Meta+\\');
    const asideReloaded = page.getByRole('complementary', { name: 'Agent' });
    await expect(asideReloaded).toBeVisible();
    const reloadedBox = await asideReloaded.boundingBox();
    if (!reloadedBox) throw new Error('agent panel has no box after reload');
    expect(Math.abs(reloadedBox.width - widthAfter)).toBeLessThan(4);
  });
});

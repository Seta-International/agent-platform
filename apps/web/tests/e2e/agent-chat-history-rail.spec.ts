import { expect, test } from '@playwright/test';
import { signInAsAdmin } from './helpers/auth';

test.describe('Agent chat-history rail (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // below the lg (1024px) cutoff

  test('hamburger opens the chat-history rail and dismiss closes it', async ({ page, request }) => {
    await signInAsAdmin(request);
    await page.goto('/agent/chat');

    // Desktop rail is hidden below lg; the mobile hamburger is the only way in.
    const hamburger = page.getByRole('button', { name: /open chats/i });
    await expect(hamburger).toBeVisible();

    await hamburger.click();

    // The rail lives inside the native <dialog aria-label="Chat navigation">.
    const rail = page.getByRole('dialog', { name: /chat navigation/i });
    await expect(rail).toBeVisible({ timeout: 5_000 });
    // It is a real, non-zero sheet (guards the "opens but invisible" regression).
    const box = await rail.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(200);
    expect(box?.height ?? 0).toBeGreaterThan(400);
    // And it carries the thread search affordance from AgentThreadRail.
    await expect(rail.getByRole('textbox', { name: /search threads/i })).toBeVisible();

    // Light-dismiss (purpose="info" allows backdrop click) closes it.
    await page.keyboard.press('Escape');
    await expect(rail).toBeHidden();
  });
});

import { expect, test } from '@playwright/test';

test('notification: synthesize -> badge appears -> drawer shows -> mark all clears', async ({
  page,
  request,
}) => {
  // Clear any unread rows left from previous runs so the badge starts empty.
  await request.post('/api/core/v1/notifications/read-all');

  // Watch for the SSE EventSource connection before navigating; otherwise the synthesize
  // kick can fire before the browser has subscribed and be lost.
  const sseConnected = page.waitForRequest(
    (r) => r.url().includes('/api/core/v1/notifications/stream'),
    { timeout: 10_000 },
  );
  await page.goto('/planner/groups');

  const bell = page.getByRole('button', { name: /^Notifications/i });
  await expect(bell).toBeVisible();

  await sseConnected;
  // Give the server a beat to register the connection in the hub.
  await page.waitForTimeout(500);

  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await request.post('/api/core/v1/notifications/__dev/synthesize', {
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    data: { event_type: 'core.dev.sample', payload: { title: 'E2E Hello' } },
  });
  expect(res.status()).toBe(202);

  // Badge appears: SSE invalidates → unread-count refetches → label becomes "Notifications (N)".
  await expect(page.getByRole('button', { name: /Notifications \(\d+\)/ })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole('button', { name: /Notifications \(\d+\)/ }).click();
  // Previous runs against the same DB can leave rows with the same title — assert at least one.
  await expect(page.getByText('E2E Hello').first()).toBeVisible();

  await page.getByRole('button', { name: /mark all as read/i }).click();

  // Badge clears: aria-label collapses back to "Notifications" (no count parens).
  await expect(page.getByRole('button', { name: /Notifications \(\d+\)/ })).toHaveCount(0, {
    timeout: 5_000,
  });
});

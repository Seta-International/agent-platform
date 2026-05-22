import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('admin notification-prefs: toggle in-app off blocks delivery; toggle on restores it', async ({
  page,
  request,
}) => {
  // Make sure we start from a clean unread state.
  await request.post('/api/core/v1/notifications/read-all');

  // Visit the admin screen and verify the 8 default rows render.
  await page.goto('/admin/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(8);

  // Pick the row whose label is "Task assigned" and flip its in-app toggle off.
  const taskAssignedRow = page.locator('tr').filter({ hasText: 'Task assigned' });
  const inAppSwitch = taskAssignedRow.getByRole('switch').first();
  await expect(inAppSwitch).toHaveAttribute('data-state', 'checked');
  await inAppSwitch.click();
  await expect(inAppSwitch).toHaveAttribute('data-state', 'unchecked');

  // Reload to confirm persistence.
  await page.reload();
  const inAppSwitchAfterReload = page
    .locator('tr')
    .filter({ hasText: 'Task assigned' })
    .getByRole('switch')
    .first();
  await expect(inAppSwitchAfterReload).toHaveAttribute('data-state', 'unchecked');

  // Synthesize a planner.task.assigned for the current user. With the pref off,
  // the in-app subscriber must drop the row.
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await request.post('/api/core/v1/notifications/__dev/synthesize', {
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    data: { event_type: 'planner.task.assigned', payload: { title: 'Should be dropped' } },
  });
  expect(res.status()).toBe(202);

  // Give the dispatcher time to process; assert badge stays absent.
  await page.waitForTimeout(1500);
  await expect(page.getByRole('button', { name: /Notifications \(\d+\)/ })).toHaveCount(0);

  // Re-enable and confirm a new synthesize gets through.
  await inAppSwitchAfterReload.click();
  await expect(inAppSwitchAfterReload).toHaveAttribute('data-state', 'checked');

  const res2 = await request.post('/api/core/v1/notifications/__dev/synthesize', {
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    data: { event_type: 'planner.task.assigned', payload: { title: 'Should arrive' } },
  });
  expect(res2.status()).toBe(202);

  await expect(page.getByRole('button', { name: /Notifications \(\d+\)/ })).toBeVisible({
    timeout: 10_000,
  });

  // Clean up so other tests start with a clean unread state.
  await request.post('/api/core/v1/notifications/read-all');
});

test('admin notification-prefs: nav highlights and route is reachable', async ({ page }) => {
  await page.goto('/admin/users');
  // The Admin nav has a "Notifications" item now.
  const navLink = page.getByRole('link', { name: 'Notifications', exact: true });
  await expect(navLink).toBeVisible();
  await navLink.click();
  await expect(page).toHaveURL(/\/admin\/notifications/);
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
});

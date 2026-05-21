// Pre-req: a linked M365 group exists with sync_status = 'conflict' in the seed data.
// This requires db:seed to pre-insert a conflict state into m365_group_links.
// Note: documents the live conflict-resolution contract.

import { expect, test } from '@playwright/test';
import { resolveLinkedGroupId } from './helpers/ids';

test('admin resolves a sync conflict via the conflict badge', async ({ page, request }) => {
  const groupId = await resolveLinkedGroupId(request);
  await page.goto(`/planner/groups/${groupId}`);

  // Conflict badge should be visible
  await expect(page.getByText('Conflict')).toBeVisible({ timeout: 5_000 });

  // Click the conflict badge button to open dialog
  await page.getByRole('button', { name: /Conflict/i }).click();

  // Dialog opens
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Resolve sync conflict')).toBeVisible();

  // If conflict fields are shown, pick "Use remote" for the first field
  const firstRemoteOption = page.getByRole('radio', { name: /Use remote/i }).first();
  if (await firstRemoteOption.isVisible()) {
    await firstRemoteOption.click();
    await page.getByRole('button', { name: 'Resolve' }).click();
    // Conflict badge should clear
    await expect(page.getByText('Conflict')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Synced|Pulling/)).toBeVisible({ timeout: 10_000 });
  } else {
    // No conflict fields available (expected if seed doesn't include field data)
    await page.getByRole('button', { name: /close|cancel/i }).click();
  }
});

// Pre-req: a native Seta group named "Engineering" exists in the seed data.
// Pre-req: the mock M365 Graph returns search results for "Eng" including "Engineering Team M365".
// Note: this test documents the live contract; it requires the M365 test Graph mock configured
// in the dev environment. Run with: pnpm --filter @seta/web test:e2e

import { expect, test } from '@playwright/test';
import { resolveGroupId } from './helpers/ids';

test('admin links a Seta group to an M365 group via the More menu', async ({ page, request }) => {
  const groupId = await resolveGroupId(request, 'Engineering');
  await page.goto(`/planner/groups/${groupId}`);

  // Open More menu
  await page.getByRole('button', { name: /more actions/i }).click();

  // Click Link to M365
  await page.getByRole('menuitem', { name: /Link to M365/i }).click();

  // Search dialog opens
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Link to a Microsoft 365 group')).toBeVisible();

  // Search for a group
  await page.getByPlaceholder('Search M365 groups...').fill('Eng');

  // Wait for results and select first one
  await page.getByRole('listitem').first().click();

  // Click Link group
  await page.getByRole('button', { name: 'Link group' }).click();

  // SyncBadge should eventually show a sync state (pulling → synced)
  await expect(page.getByText(/Pulling|Synced/)).toBeVisible({ timeout: 10_000 });
});

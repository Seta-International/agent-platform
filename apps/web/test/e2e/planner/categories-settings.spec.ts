import { expect, test } from '@playwright/test';
import { resolvePlanId } from '../helpers/ids';

test('plan admin edits categories and labels', async ({ page, request }) => {
  const planId = await resolvePlanId(request, 'Engineering', 'Q2 Infrastructure');

  await page.goto(`/planner/plans/${planId}/settings/categories`);

  // Page heading: "<Plan name> settings". We assert the settings page is up.
  await expect(page.getByRole('heading', { level: 1, name: /settings/i })).toBeVisible();

  await page.getByRole('textbox', { name: 'Slot 1 description' }).fill('Bug');
  await page.getByRole('textbox', { name: 'Slot 2 description' }).fill('Customer-reported');
  await page.getByRole('textbox', { name: 'Slot 3 description' }).fill('Customer-impacting');

  // Attach a label to slot 3. The button only appears when slot 3 has no
  // existing label; if a previous run already attached one, "change label"
  // opens the same picker.
  const attach3 = page.getByRole('button', { name: 'Slot 3 attach label' });
  const change3 = page.getByRole('button', { name: 'Slot 3 change label' });
  if (await attach3.isVisible().catch(() => false)) {
    await attach3.click();
  } else {
    await change3.click();
  }
  // First option in the label picker is fine for the contract test.
  await page.getByRole('option').first().click();

  await page.getByRole('button', { name: /Save changes/ }).click();
  await expect(page.getByText(/Categories saved/)).toBeVisible();

  // Reload and assert persistence.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Slot 1 description' })).toHaveValue('Bug');
  await expect(page.getByRole('textbox', { name: 'Slot 2 description' })).toHaveValue(
    'Customer-reported',
  );
  await expect(page.getByRole('textbox', { name: 'Slot 3 description' })).toHaveValue(
    'Customer-impacting',
  );
});

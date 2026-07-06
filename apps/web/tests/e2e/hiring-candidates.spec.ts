import { expect, test } from '@playwright/test';

// Runs as org.admin (wildcard) from global-setup storage state — holds all hiring.* perms.

test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
const REQ_A = `E2E Cand Role A ${STAMP}`;
const REQ_B = `E2E Cand Role B ${STAMP}`;
const CAND = `E2E Candidate ${STAMP}`;
const REASON = `E2E Reason ${STAMP}`;

test('setup: two open roles and a rejection reason exist', async ({ page }) => {
  for (const title of [REQ_A, REQ_B]) {
    await page.goto('/hiring/requisitions');
    await page.getByRole('button', { name: 'New requisition' }).click();
    await page.getByPlaceholder('e.g. Senior Backend Engineer').fill(title);
    await page
      .getByPlaceholder('One short paragraph on the role and its context…')
      .fill('Own the platform roadmap and mentor the team.');
    await page.getByRole('button', { name: 'Create requisition' }).click();
    await expect(page.getByText('Requisition created')).toBeVisible({ timeout: 8_000 });
  }

  await page.goto('/hiring/settings');
  await page.getByRole('button', { name: 'New rejection reason' }).click();
  await page.getByPlaceholder('e.g. Lacking required skills').fill(REASON);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Rejection reason created')).toBeVisible({ timeout: 8_000 });
});

test('create a candidate and it appears on the board', async ({ page }) => {
  await page.goto('/hiring/candidates');
  await expect(page.getByRole('heading', { name: 'Candidates' })).toBeVisible();

  await page.getByRole('button', { name: 'New candidate' }).click();
  // Label text is "Full name *" — the asterisk is part of the rendered label text.
  await page.getByLabel('Full name *').fill(CAND);
  // Position applied is a native <select> linked via id="cand-req" to label "Position applied *".
  await page.getByLabel('Position applied *').selectOption({ label: REQ_A });
  await page.getByRole('button', { name: 'Save candidate' }).click();

  await expect(page.getByText('Candidate added')).toBeVisible({ timeout: 8_000 });
  // Board cards are <button type="button"> elements whose text content includes the candidate name.
  // The react-beautiful-dnd Draggable wrapper also renders a div[role="button"] drag handle,
  // so we scope to the actual <button> element to avoid strict-mode violations.
  await expect(page.locator('button[type="button"]', { hasText: CAND })).toBeVisible();
});

test('move the candidate to Interview and the timeline records it', async ({ page }) => {
  await page.goto('/hiring/candidates');
  // Open the candidate detail drawer via the board card button (scoped to <button type="button">
  // to avoid the react-beautiful-dnd drag-handle div[role="button"]).
  await page.locator('button[type="button"]', { hasText: CAND }).click();
  // Stage controls in the drawer are four buttons: New / Screening / Interview / Offer.
  // The Sheet uses @radix-ui/react-dialog and its SheetTitle renders as <h2> → dialog name.
  const drawer = page.getByRole('dialog', { name: CAND });
  await drawer.getByRole('button', { name: 'Interview' }).click();
  // Stage move fires toast.success('Stage updated').
  await expect(page.getByText('Stage updated')).toBeVisible({ timeout: 8_000 });
  // After the drawer reloads the candidate detail, the activity timeline shows "Stage changed".
  await expect(drawer.getByText('Stage changed')).toBeVisible({ timeout: 8_000 });
});

test('reject the candidate with a reason', async ({ page }) => {
  await page.goto('/hiring/candidates');
  await page.locator('button[type="button"]', { hasText: CAND }).click();

  const drawer = page.getByRole('dialog', { name: CAND });
  // The drawer footer has a "Reject" destructive button that opens the RejectDialog.
  await drawer.getByRole('button', { name: 'Reject' }).click();

  // RejectDialog renders its own Dialog (portal); its title is "Reject candidate".
  // Scope subsequent actions to that dialog to avoid strict-mode collision with the drawer's
  // own "Reject" trigger button (there are two elements named "Reject" in the DOM at this point).
  const rejectDialog = page.getByRole('dialog', { name: 'Reject candidate' });
  await rejectDialog.getByLabel('Reason').selectOption({ label: REASON });
  // Confirm button text is "Reject" (not "Reject candidate") — scope to the dialog to be safe.
  await rejectDialog.getByRole('button', { name: 'Reject', exact: true }).click();

  await expect(page.getByText('Candidate rejected')).toBeVisible({ timeout: 8_000 });
});

test('rejected candidate shows in the talent pool', async ({ page }) => {
  await page.goto('/hiring/candidates');
  // The Talent pool card is a Card at the bottom of the page.
  // Its toggle button says "Show" when collapsed and "Hide" when expanded.
  // Scope to the card region (the wrapping div that has mt-6 class) to avoid collision
  // with any other "Show" control elsewhere on the page.
  // CardTitle renders as a plain <div>, so we filter by its exact text and walk up to the Card.
  const talentPoolCard = page
    .locator('div')
    .filter({ hasText: /^Talent pool$/ })
    .locator('xpath=ancestor::div[contains(@class,"mt-6")][1]');
  await talentPoolCard.getByRole('button', { name: 'Show' }).click();

  await expect(page.getByText(CAND)).toBeVisible({ timeout: 8_000 });
});

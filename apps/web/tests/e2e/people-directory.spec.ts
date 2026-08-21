import { expect, request, test } from '@playwright/test';

// Runs as org.admin (wildcard) from global-setup storage state.
// Admin holds people.worker.read + people.worker.update + people.worker.create.
//
// Skills are people-owned and synchronous — safe to assert without polling.
// Account/project projections are async PM→people; do NOT assert on them in time-sensitive paths.

const WORKER_NAME = 'E2E Directory Worker';
const WORKER_EMAIL = 'e2e-directory@sandbox.test';
const SKILL_NAME = 'E2E-Playwright';
const SKILL_CAT_NAME = 'E2E-Automation';

interface WorkerRow {
  worker_id: string;
  full_name: string;
  work_email: string | null;
  version: number;
  skills: { id: string; name: string }[];
}

interface SkillRow {
  id: string;
  name: string;
}

interface SkillCatRow {
  id: string;
  name: string;
}

let workerId: string;
let workerVersion: number;
let skillId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const ctx = await request.newContext({
    baseURL: 'http://localhost:5173',
    storageState: '.auth/admin.json',
  });

  // 1. Ensure a skill category exists.
  const catListRes = await ctx.get('/api/identity/v1/skill-categories');
  if (!catListRes.ok())
    throw new Error(`list skill-categories: ${catListRes.status()} ${await catListRes.text()}`);
  const { categories } = (await catListRes.json()) as { categories: SkillCatRow[] };
  let catId = categories.find((c) => c.name === SKILL_CAT_NAME)?.id;
  if (!catId) {
    const createCatRes = await ctx.post('/api/identity/v1/skill-categories', {
      data: { name: SKILL_CAT_NAME },
    });
    if (!createCatRes.ok())
      throw new Error(
        `create skill-category: ${createCatRes.status()} ${await createCatRes.text()}`,
      );
    catId = ((await createCatRes.json()) as SkillCatRow).id;
  }

  // 2. Ensure the test skill exists in the catalog.
  const skillListRes = await ctx.get('/api/identity/v1/skills');
  if (!skillListRes.ok())
    throw new Error(`list skills: ${skillListRes.status()} ${await skillListRes.text()}`);
  const { skills } = (await skillListRes.json()) as { skills: SkillRow[] };
  let existing = skills.find((s) => s.name === SKILL_NAME);
  if (!existing) {
    const createSkillRes = await ctx.post('/api/identity/v1/skills', {
      data: { category_id: catId, name: SKILL_NAME },
    });
    if (!createSkillRes.ok())
      throw new Error(`create skill: ${createSkillRes.status()} ${await createSkillRes.text()}`);
    existing = (await createSkillRes.json()) as SkillRow;
  }
  skillId = existing.id;

  // 3. Idempotently ensure the test worker exists.
  const listRes = await ctx.get('/api/people/v1/workers');
  if (!listRes.ok()) throw new Error(`list workers: ${listRes.status()} ${await listRes.text()}`);
  const { rows } = (await listRes.json()) as { rows: WorkerRow[] };

  let worker = rows.find((w) => w.full_name === WORKER_NAME);
  if (!worker) {
    const createRes = await ctx.post('/api/people/v1/workers', {
      data: { full_name: WORKER_NAME, work_email: WORKER_EMAIL },
    });
    if (!createRes.ok())
      throw new Error(`create worker: ${createRes.status()} ${await createRes.text()}`);
    // Fetch fresh to get version + skills array.
    const fetched = await ctx.get(
      `/api/people/v1/workers/${((await createRes.json()) as { worker_id: string }).worker_id}`,
    );
    worker = (await fetched.json()) as WorkerRow;
  }
  workerId = worker.worker_id;

  // 4. Set job_title via PATCH so the subtitle is visible in the directory.
  const detailRes = await ctx.get(`/api/people/v1/workers/${workerId}`);
  if (!detailRes.ok())
    throw new Error(`fetch worker: ${detailRes.status()} ${await detailRes.text()}`);
  const detail = (await detailRes.json()) as WorkerRow & { job_title: string | null };
  workerVersion = detail.version;

  if (detail.job_title !== 'Staff Engineer') {
    const patchRes = await ctx.patch(`/api/people/v1/workers/${workerId}`, {
      data: {
        expected_version: workerVersion,
        patch: { job_title: 'Staff Engineer' },
      },
    });
    if (!patchRes.ok())
      throw new Error(`patch job_title: ${patchRes.status()} ${await patchRes.text()}`);
    workerVersion = ((await patchRes.json()) as { version: number }).version;
  }

  // 5. Ensure the test skill is attached to the worker.
  const hasSkill = detail.skills?.some((s) => s.id === skillId);
  if (!hasSkill) {
    const addSkillRes = await ctx.post(`/api/people/v1/workers/${workerId}/skills`, {
      data: { skill_id: skillId },
    });
    if (!addSkillRes.ok())
      throw new Error(`add worker skill: ${addSkillRes.status()} ${await addSkillRes.text()}`);
  }

  await ctx.dispose();
});

// ─── Test 1: Directory loads with all rich columns ───────────────────────────
test('directory loads with rich column headers', async ({ page }) => {
  await page.goto('/people/employees');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Account' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Direct manager' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Techstack' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Access' })).toBeVisible();
});

// ─── Test 2: Admin — result count is present ──────────────────────────────────
test('admin: result count is present', async ({ page }) => {
  await page.goto('/people/employees');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  // Wait for data to load (count text appears when query resolves).
  await expect(page.getByText(/\d+ (people|person)/i)).toBeVisible({ timeout: 8_000 });
});

// ─── Test 3: Search filters to the test worker + shows job_title subtitle ────
test('search: test worker appears with job_title subtitle', async ({ page }) => {
  await page.goto('/people/employees');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();

  await page.getByPlaceholder('Search people…').fill(WORKER_NAME);
  // Debounce is 300 ms; allow up to 5 s for network.
  await expect(page.getByText(WORKER_NAME)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('Staff Engineer')).toBeVisible({ timeout: 5_000 });
});

// ─── Test 4: Techstack (skill) filter — synchronous, safe to assert ───────────
test('skill filter: filtering by known skill surfaces the test worker', async ({ page }) => {
  await page.goto('/people/employees');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();

  // Open the Techstack AsyncCombobox picker.
  // Multiple comboboxes exist; find the one that currently shows the "Techstack" placeholder.
  const techstackTrigger = page.locator('[role="combobox"]').filter({ hasText: 'Techstack' });
  await techstackTrigger.click();

  // The CommandInput inside the popover — type the skill name.
  const searchInput = page.getByPlaceholder('Search…');
  await searchInput.fill(SKILL_NAME);

  // The skill item should appear in the list.
  const skillItem = page.getByRole('option', { name: SKILL_NAME });
  await expect(skillItem).toBeVisible({ timeout: 5_000 });
  await skillItem.click();

  // After selection, the test worker (who has the skill) must be visible.
  await expect(page.getByText(WORKER_NAME)).toBeVisible({ timeout: 5_000 });
});

// ─── Test 5: Pagination — pager controls are present and usable ───────────────
test('pagination controls are present for the seeded roster', async ({ page }) => {
  await page.goto('/people/employees');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();

  // The Astryx Table pager renders "Showing X–Y of Z" text and Previous/Next buttons.
  // We assert the pager renders; if only 1 page exists the "Next" button will be disabled.
  await expect(page.getByText(/showing \d+/i)).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('button', { name: 'Previous' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();

  // If the roster is large enough for page 2, click Next and verify page changes.
  const nextBtn = page.getByRole('button', { name: 'Next' });
  const isNextEnabled = await nextBtn.isEnabled();
  if (isNextEnabled) {
    // Capture first row text before navigation.
    const firstRowBefore = await page
      .locator('tbody tr:first-child td:nth-child(2)')
      .innerText()
      .catch(() => '');
    await nextBtn.click();
    // Either a "Page 2" button is now current, or the "Showing" text has updated.
    await expect(page.getByRole('button', { name: 'Page 2' })).toHaveAttribute(
      'aria-current',
      'page',
      { timeout: 5_000 },
    );
    const firstRowAfter = await page
      .locator('tbody tr:first-child td:nth-child(2)')
      .innerText()
      .catch(() => '');
    // Rows on page 2 should differ from page 1.
    expect(firstRowAfter).not.toBe(firstRowBefore);
  } else {
    // Single-page roster is fine — just assert the control renders correctly.
    await expect(nextBtn).toBeDisabled();
  }
});

// ─── Test 6: Card / List view toggle ─────────────────────────────────────────
test('card/list toggle: switching to Cards view shows worker card', async ({ page }) => {
  await page.goto('/people/employees');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();

  // Scope to the test worker first so we don't rely on page 1 position.
  await page.getByPlaceholder('Search people…').fill(WORKER_NAME);
  await expect(page.getByText(WORKER_NAME)).toBeVisible({ timeout: 5_000 });

  // The SegmentedControl renders role="radiogroup" with "List" and "Cards" radio buttons.
  const directoryControl = page.getByRole('radiogroup', { name: 'Directory view' });
  await directoryControl.getByRole('radio', { name: 'Cards' }).click();

  // Card view renders worker cards — the worker's name should still be visible.
  await expect(page.getByText(WORKER_NAME)).toBeVisible({ timeout: 5_000 });

  // Toggle back to List.
  await directoryControl.getByRole('radio', { name: 'List' }).click();
  // The column header should reappear (table is restored).
  await expect(page.getByRole('columnheader', { name: 'Employee' })).toBeVisible();
});

// ─── Test 7: Worker profile — read-only view (no Edit button for any role) ────
test('worker profile: renders employee information in read-only mode without Edit button', async ({
  page,
}) => {
  await page.goto(`/people/employees/${workerId}`);
  await expect(page.getByRole('heading', { name: WORKER_NAME })).toBeVisible({ timeout: 8_000 });

  // AC1: Edit button is not displayed for any role
  await expect(page.getByRole('button', { name: 'Edit' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).not.toBeVisible();

  // AC2: Employee information is read-only
  await expect(page.getByText('Staff Engineer')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(WORKER_EMAIL)).toBeVisible({ timeout: 5_000 });

  // Techstack skill is displayed in read-only mode
  await expect(page.getByText(SKILL_NAME)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByPlaceholder('Search to add a skill…')).not.toBeVisible();
});

// ─── Test 8: Multi-account chips (best-effort, skip if none present) ──────────
test('multi-account chips: best-effort assertion skipped (async projection)', async () => {
  // Account/project chip data arrives via an async PM→people projection; asserting on
  // it in a synchronous e2e test is inherently flaky. Backend correctness is fully
  // covered by Tasks 2.7/3.2 integration tests.
  //
  // If this roster ever reliably has a person with ≥2 seeded accounts, this test
  // can be activated by querying the API in beforeAll and conditionally asserting.
  test.skip(true, 'async PM→people projection: covered by backend integration tests 2.7/3.2');
});

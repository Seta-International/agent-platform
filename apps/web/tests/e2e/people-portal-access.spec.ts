import { expect, request, test } from '@playwright/test';

// Runs as the org.admin (wildcard) from global-setup storage state.
// The admin holds people.worker.portal_access.set via org.admin, so the
// "Login & access" card is visible and the Switch is interactive.

const WORKER_NAME = 'E2E Portal Access Worker';
const WORKER_EMAIL = 'e2e-portal@sandbox.test';

interface WorkerRow {
  worker_id: string;
  full_name: string;
  work_email: string | null;
  portal_access: boolean;
}

let workerId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const ctx = await request.newContext({
    baseURL: 'http://localhost:5173',
    storageState: '.auth/admin.json',
  });

  const listRes = await ctx.get('/api/people/v1/workers');
  if (!listRes.ok())
    throw new Error(`list workers failed: ${listRes.status()} ${await listRes.text()}`);
  const { workers } = (await listRes.json()) as { workers: WorkerRow[] };

  const existing = workers.find((w) => w.full_name === WORKER_NAME);
  if (existing) {
    workerId = existing.worker_id;
    // Ensure portal_access is off so the toggle test starts from a known state.
    if (existing.portal_access) {
      await ctx.post(`/api/people/v1/workers/${workerId}/portal-access`, {
        data: { enabled: false },
      });
    }
  } else {
    const createRes = await ctx.post('/api/people/v1/workers', {
      data: { full_name: WORKER_NAME, work_email: WORKER_EMAIL },
    });
    if (!createRes.ok())
      throw new Error(`create worker failed: ${createRes.status()} ${await createRes.text()}`);
    const created = (await createRes.json()) as WorkerRow;
    workerId = created.worker_id;
  }

  await ctx.dispose();
});

test('people directory: worker row is visible with Access column', async ({ page }) => {
  await page.goto('/people');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Access' })).toBeVisible();
  // Directory holds the full seeded roster; filter to the target row so the
  // assertion is independent of page size / row ordering.
  await page.getByPlaceholder(/search/i).fill(WORKER_NAME);
  await expect(page.getByText(WORKER_NAME)).toBeVisible();
});

test('worker profile: Login & access card renders with Switch', async ({ page }) => {
  await page.goto(`/people/${workerId}`);
  await expect(page.getByRole('heading', { name: WORKER_NAME })).toBeVisible();
  await expect(page.getByText('Login & access')).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'Portal access' });
  await expect(toggle).toBeVisible();
});

test('worker profile: toggling portal access ON shows success toast', async ({ page }) => {
  await page.goto(`/people/${workerId}`);
  await expect(page.getByRole('heading', { name: WORKER_NAME })).toBeVisible();

  const toggle = page.getByRole('switch', { name: 'Portal access' });
  await expect(toggle).toBeVisible();

  // Start from OFF (ensured in beforeAll).
  await expect(toggle).not.toBeChecked();

  await toggle.click();

  await expect(page.getByText('Portal access enabled')).toBeVisible();
  await expect(toggle).toBeChecked();
});

test('worker profile: toggling portal access OFF shows success toast', async ({ page }) => {
  await page.goto(`/people/${workerId}`);
  await expect(page.getByRole('heading', { name: WORKER_NAME })).toBeVisible();

  const toggle = page.getByRole('switch', { name: 'Portal access' });
  await expect(toggle).toBeVisible();

  // Previous test left it ON.
  await expect(toggle).toBeChecked();

  await toggle.click();

  await expect(page.getByText('Portal access disabled')).toBeVisible();
  await expect(toggle).not.toBeChecked();
});

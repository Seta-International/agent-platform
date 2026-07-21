import { expect, request, test } from '@playwright/test';

interface Capacity {
  kind: string;
  project_id?: string;
  account_id?: string;
  label: string;
}
interface Ctx {
  status: string;
  capacities?: Capacity[];
}

test.describe('performance shell + capacity switcher (Story 1.2 / FUT-693)', () => {
  test('capacity switch writes the URL scope and deep-links resolve it (AC2–AC4)', async ({
    page,
    browser,
  }) => {
    const api = await request.newContext({
      baseURL: 'http://localhost:5173',
      storageState: '.auth/admin.json',
    });
    const res = await api.get('/api/people/v1/performance/context');
    expect(res.ok()).toBe(true);
    const ctx = (await res.json()) as Ctx;
    await api.dispose();

    test.skip(
      ctx.status !== 'ok' || (ctx.capacities?.length ?? 0) < 2,
      'admin needs 2+ capacities for the switch scenario',
    );
    const capacities = ctx.capacities as Capacity[];

    await page.goto('/people/performance');
    // Section nav is visible (role-filtered affordance).
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 8_000 });

    // Switch to the second capacity → URL carries the scope tuple.
    const second = capacities[1];
    if (!second) throw new Error('unreachable: skip guard ensures 2+ capacities');
    const kindLabel = { am: 'AM', tl: 'TL', member: 'Member' }[second.kind] ?? second.kind;
    await page.getByRole('combobox', { name: 'Capacity' }).click();
    await page.getByRole('option', { name: `${kindLabel} · ${second.label}` }).click();
    const expectedParam = `${second.kind}:${second.kind === 'am' ? second.account_id : second.project_id}`;
    await expect(page).toHaveURL(new RegExp(`capacity=${expectedParam}`));

    // AC4: the copied URL resolves the same scope in a fresh page.
    const url = page.url();
    const fresh = await browser.newContext({ storageState: '.auth/admin.json' });
    const page2 = await fresh.newPage();
    await page2.goto(url);
    await expect(page2.getByText(`${kindLabel} · ${second.label}`)).toBeVisible({
      timeout: 8_000,
    });
    await fresh.close();
  });
});

import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { createAccountInput, editAccountPatch } from '../../contracts.ts';
import {
  createAccount,
  editAccount,
  getAccount,
  listAccounts,
  setAccountRecruiters,
} from '../../index.ts';

const editBody = z.object({
  expected_version: z.number().int().positive().optional(),
  patch: editAccountPatch,
});
const recruitersBody = z.object({ recruiter_worker_ids: z.array(z.string().uuid()) });

export function registerPmAccountsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/pm/v1/accounts', async (c) =>
    c.json({ accounts: await listAccounts(c.get('user')) }),
  );
  app.get('/api/pm/v1/accounts/:id', async (c) =>
    c.json(await getAccount({ account_id: c.req.param('id'), session: c.get('user') })),
  );
  app.post('/api/pm/v1/accounts', async (c) => {
    const parsed = createAccountInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await createAccount({ ...parsed.data, session: c.get('user') }), 201);
  });
  app.patch('/api/pm/v1/accounts/:id', async (c) => {
    const parsed = editBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await editAccount({ account_id: c.req.param('id'), ...parsed.data, session: c.get('user') }),
    );
  });
  app.put('/api/pm/v1/accounts/:id/recruiters', async (c) => {
    const parsed = recruitersBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await setAccountRecruiters({
        account_id: c.req.param('id'),
        recruiter_worker_ids: parsed.data.recruiter_worker_ids,
        session: c.get('user'),
      }),
    );
  });
}

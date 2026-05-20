import type { SessionEnv } from '@seta/core';
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroup,
  listGroupMembers,
  listGroups,
  listMyAccessibleGroups,
  removeGroupMember,
  restoreGroup,
  updateGroup,
} from '@seta/planner';
import type { Hono } from 'hono';
import { z } from 'zod';

const createSchema = z.object({ name: z.string().min(1).max(120) });
const updateSchema = z.object({
  expected_version: z.number().int().positive(),
  patch: z.object({ name: z.string().min(1).max(120).optional() }),
});
const versionSchema = z.object({ expected_version: z.number().int().positive() });
const memberSchema = z.object({ user_id: z.string().uuid() });

export function registerPlannerGroupsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/planner/v1/groups', async (c) => {
    const session = c.get('user');
    const include_deleted = c.req.query('include_deleted') === 'true';
    return c.json({ groups: await listGroups({ session, include_deleted }) });
  });

  app.get('/api/planner/v1/groups/mine', async (c) => {
    const session = c.get('user');
    return c.json({ groups: await listMyAccessibleGroups({ session }) });
  });

  app.get('/api/planner/v1/groups/:id', async (c) => {
    const session = c.get('user');
    return c.json(await getGroup({ group_id: c.req.param('id'), session }));
  });

  app.post('/api/planner/v1/groups', async (c) => {
    const session = c.get('user');
    const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await createGroup({ tenant_id: session.tenant_id, name: parsed.data.name, session }),
      201,
    );
  });

  app.patch('/api/planner/v1/groups/:id', async (c) => {
    const session = c.get('user');
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await updateGroup({
        group_id: c.req.param('id'),
        expected_version: parsed.data.expected_version,
        patch: parsed.data.patch,
        session,
      }),
    );
  });

  app.delete('/api/planner/v1/groups/:id', async (c) => {
    const session = c.get('user');
    const parsed = versionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await deleteGroup({
      group_id: c.req.param('id'),
      expected_version: parsed.data.expected_version,
      session,
    });
    return c.body(null, 204);
  });

  app.post('/api/planner/v1/groups/:id/restore', async (c) => {
    const session = c.get('user');
    return c.json(await restoreGroup({ group_id: c.req.param('id'), session }));
  });

  app.get('/api/planner/v1/groups/:id/members', async (c) => {
    const session = c.get('user');
    return c.json({ members: await listGroupMembers({ group_id: c.req.param('id'), session }) });
  });

  app.post('/api/planner/v1/groups/:id/members', async (c) => {
    const session = c.get('user');
    const parsed = memberSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await addGroupMember({ group_id: c.req.param('id'), user_id: parsed.data.user_id, session });
    return c.body(null, 204);
  });

  app.delete('/api/planner/v1/groups/:id/members/:userId', async (c) => {
    const session = c.get('user');
    await removeGroupMember({
      group_id: c.req.param('id'),
      user_id: c.req.param('userId'),
      session,
    });
    return c.body(null, 204);
  });
}

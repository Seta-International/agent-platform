import type { SessionEnv } from '@seta/core';
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroup,
  getGroupActivity,
  linkGroupToM365,
  listGroupMembers,
  listGroups,
  listGroupsWithCounts,
  listMyAccessibleGroups,
  removeGroupMember,
  restoreGroup,
  setMemberRole,
  unlinkGroupFromM365,
  updateGroup,
} from '@seta/planner';
import type { Hono } from 'hono';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  theme: z.enum(['teal', 'purple', 'green', 'blue', 'pink', 'orange', 'red']).optional(),
  visibility: z.enum(['private', 'public']).optional(),
  default_role: z.enum(['owner', 'member']).optional(),
});
const updateSchema = z.object({
  expected_version: z.number().int().positive(),
  patch: z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().nullable().optional(),
    theme: z.enum(['teal', 'purple', 'green', 'blue', 'pink', 'orange', 'red']).optional(),
    visibility: z.enum(['private', 'public']).optional(),
    default_role: z.enum(['owner', 'member']).optional(),
  }),
});
const versionSchema = z.object({ expected_version: z.number().int().positive() });
const memberSchema = z.object({ user_id: z.string().uuid() });
const setMemberRoleSchema = z.object({ role: z.enum(['owner', 'member']) });
const linkM365Schema = z.object({ external_id: z.string().min(1) });

export function registerPlannerGroupsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/planner/v1/groups', async (c) => {
    const session = c.get('user');
    const include_deleted = c.req.query('include_deleted') === 'true';
    const withCounts = c.req.query('withCounts') === 'true';
    if (withCounts) {
      return c.json({ groups: await listGroupsWithCounts({ session, include_deleted }) });
    }
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
      await createGroup({
        tenant_id: session.tenant_id,
        name: parsed.data.name,
        description: parsed.data.description,
        theme: parsed.data.theme,
        visibility: parsed.data.visibility,
        default_role: parsed.data.default_role,
        session,
      }),
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

  app.get('/api/planner/v1/groups/:id/activity', async (c) => {
    const session = c.get('user');
    const sinceParam = c.req.query('since');
    const limitParam = c.req.query('limit');
    const since = sinceParam ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
    const limit = limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10), 1), 50) : 8;
    try {
      return c.json(
        await getGroupActivity({
          group_id: c.req.param('id'),
          since,
          limit,
          session,
        }),
      );
    } catch (err) {
      console.error('[group-activity] failed', err);
      throw err;
    }
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

  app.patch('/api/planner/v1/groups/:id/members/:userId/role', async (c) => {
    const session = c.get('user');
    const parsed = setMemberRoleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await setMemberRole({
      group_id: c.req.param('id'),
      user_id: c.req.param('userId'),
      role: parsed.data.role,
      session,
    });
    return c.body(null, 204);
  });

  app.post('/api/planner/v1/groups/:id/link/m365', async (c) => {
    const session = c.get('user');
    const parsed = linkM365Schema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await linkGroupToM365({
        group_id: c.req.param('id'),
        external_id: parsed.data.external_id,
        session,
      }),
    );
  });

  app.post('/api/planner/v1/groups/:id/unlink', async (c) => {
    const session = c.get('user');
    return c.json(await unlinkGroupFromM365({ group_id: c.req.param('id'), session }));
  });
}

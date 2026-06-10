import type { SessionEnv, WorkerHandle } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import {
  addGroupMember,
  addGroupMembers,
  createGroup,
  createJoinRequest,
  deleteGroup,
  discoverGroups,
  getGroup,
  getGroupActivity,
  linkGroupToM365,
  listGroupMemberCandidates,
  listGroupMembers,
  listGroups,
  listGroupsWithCounts,
  listJoinRequests,
  listMyAccessibleGroups,
  removeGroupMember,
  removeGroupMembers,
  resolveJoinRequest,
  restoreGroup,
  setMemberRole,
  unlinkGroupFromM365,
  updateGroup,
} from '../../index.ts';

interface PlannerGroupsDeps {
  workers: WorkerHandle;
  log?: {
    error: (obj: unknown, msg?: string) => void;
  };
}

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
const bulkMembersSchema = z.object({
  members: z
    .array(z.object({ user_id: z.string().uuid() }))
    .min(1)
    .max(500),
});
const setMemberRoleSchema = z.object({ role: z.enum(['owner', 'member']) });
const bulkRemoveMembersSchema = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(500),
});
const linkM365Schema = z.object({ external_id: z.string().min(1) });
const discoverQuerySchema = z.object({ q: z.string().min(1).max(200) });
const resolveJoinRequestSchema = z.object({ action: z.enum(['approved', 'rejected']) });

export function registerPlannerGroupsRoutes(app: Hono<SessionEnv>, deps: PlannerGroupsDeps): void {
  const { workers } = deps;
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

  // ── Workspace group discovery ──────────────────────────────────────────────
  app.get('/api/planner/v1/groups/discover', async (c) => {
    const session = c.get('user');
    const parsed = discoverQuerySchema.safeParse({ q: c.req.query('q') ?? '' });
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    const results = await discoverGroups({ q: parsed.data.q, session });
    return c.json({ groups: results });
  });

  app.get('/api/planner/v1/groups/:id', async (c) => {
    const session = c.get('user');
    const include_deleted = c.req.query('include_deleted') === 'true';
    return c.json(await getGroup({ group_id: c.req.param('id'), session, include_deleted }));
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

  app.get('/api/planner/v1/groups/:id/members/candidates', async (c) => {
    const session = c.get('user');
    const search = c.req.query('search');
    const limitStr = c.req.query('limit');
    const limit = limitStr ? Math.min(Math.max(Number.parseInt(limitStr, 10), 1), 50) : 20;
    return c.json({
      candidates: await listGroupMemberCandidates({
        group_id: c.req.param('id'),
        search: search || undefined,
        limit,
        session,
      }),
    });
  });

  app.get('/api/planner/v1/groups/:id/members', async (c) => {
    const session = c.get('user');
    const limitStr = c.req.query('limit');
    const offsetStr = c.req.query('offset');
    const limit = limitStr ? Math.min(Math.max(Number.parseInt(limitStr, 10), 1), 100) : 100;
    const offset = offsetStr ? Math.max(Number.parseInt(offsetStr, 10), 0) : 0;
    return c.json(await listGroupMembers({ group_id: c.req.param('id'), limit, offset, session }));
  });

  app.get('/api/planner/v1/groups/:id/activity', async (c) => {
    const session = c.get('user');
    const sinceParam = c.req.query('since');
    const cursorParam = c.req.query('cursor');
    const limitParam = c.req.query('limit');

    // Feed path: cursor present or no since → use feed defaults
    const isFeedCall = !!cursorParam || !sinceParam;
    const defaultLimit = isFeedCall ? 30 : 8;
    const limit = limitParam
      ? Math.min(Math.max(Number.parseInt(limitParam, 10), 1), 50)
      : defaultLimit;
    // biome-ignore lint/style/noNonNullAssertion: sinceParam is required when isFeedCall is false (validated by the route schema)
    const since = !isFeedCall ? sinceParam! : undefined;

    try {
      return c.json(
        await getGroupActivity({
          group_id: c.req.param('id'),
          since,
          cursor: cursorParam ?? undefined,
          limit,
          session,
        }),
      );
    } catch (err) {
      if (deps.log) {
        deps.log.error(
          { subsystem: 'planner.group-activity', groupId: c.req.param('id'), err },
          'group activity fetch failed',
        );
      } else {
        console.error('[group-activity] failed', err);
      }
      throw err;
    }
  });

  app.post('/api/planner/v1/groups/:id/members/bulk', async (c) => {
    const session = c.get('user');
    const parsed = bulkMembersSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);

    const groupId = c.req.param('id');
    const { members } = parsed.data;

    if (members.length <= 25) {
      await addGroupMembers({ group_id: groupId, members, session });
      const updated = await listGroupMembers({ group_id: groupId, session });
      return c.json({ members: updated.members, total: updated.total }, 201);
    }

    await workers.addJob('planner.bulk_add_group_members', {
      group_id: groupId,
      user_ids: members.map((m) => m.user_id),
      actor_user_id: session.user_id,
      actor_tenant_id: session.tenant_id,
    });
    return c.json({ job_id: crypto.randomUUID() }, 202);
  });

  app.post('/api/planner/v1/groups/:id/members', async (c) => {
    const session = c.get('user');
    const parsed = memberSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await addGroupMember({ group_id: c.req.param('id'), user_id: parsed.data.user_id, session });
    return c.body(null, 204);
  });

  app.delete('/api/planner/v1/groups/:id/members/bulk', async (c) => {
    const session = c.get('user');
    const parsed = bulkRemoveMembersSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    await removeGroupMembers({
      group_id: c.req.param('id'),
      user_ids: parsed.data.user_ids,
      session,
    });
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

  // ── Join requests ──────────────────────────────────────────────────────────
  app.post('/api/planner/v1/groups/:id/join-requests', async (c) => {
    const session = c.get('user');
    const result = await createJoinRequest({ group_id: c.req.param('id'), session });
    return c.json(result, 201);
  });

  app.get('/api/planner/v1/groups/:id/join-requests', async (c) => {
    const session = c.get('user');
    const status = c.req.query('status') as 'pending' | 'approved' | 'rejected' | undefined;
    const results = await listJoinRequests({
      group_id: c.req.param('id'),
      status,
      session: session as never,
    });
    return c.json({ requests: results });
  });

  app.patch('/api/planner/v1/groups/:id/join-requests/:userId', async (c) => {
    const session = c.get('user');
    const parsed = resolveJoinRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    const result = await resolveJoinRequest({
      group_id: c.req.param('id'),
      user_id: c.req.param('userId'),
      action: parsed.data.action,
      session: session as never,
    });
    return c.json(result);
  });
}

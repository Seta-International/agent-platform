import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { m365 } from '@seta/integrations';
import { PlannerError } from '@seta/planner';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerIntegrationsM365Routes } from '../src/routes/integrations-m365.ts';

function buildSession(opts: {
  tenant_id: string;
  user_id: string;
  roles?: string[];
}): SessionScope {
  const role_summary = {
    roles: opts.roles ?? ['org.admin'],
    cross_tenant_read: false,
  };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: 'test@example.test',
    display_name: 'Test User',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

const MOCK_GROUPS = [
  { id: 'aaa-111', displayName: 'Engineering', mailNickname: 'engineering' },
  { id: 'bbb-222', displayName: 'Eng Leads', mailNickname: 'eng-leads' },
];

function buildTestApp(
  session: SessionScope,
  graphClientFor: (tenantId: string) => Promise<unknown>,
): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session);
    await next();
  });
  registerIntegrationsM365Routes(app, {
    graphClientFor: graphClientFor as (
      tenantId: string,
    ) => Promise<import('@microsoft/microsoft-graph-client').Client>,
  });
  app.onError((err, c) => {
    if (err instanceof PlannerError) {
      const status = err.code === 'FORBIDDEN' ? 403 : 400;
      return c.json({ error: err.code, message: err.message }, status);
    }
    throw err;
  });
  return app;
}

describe('GET /api/integrations/m365/groups/search', () => {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  it('returns groups for org.admin with q >= 2 chars', async () => {
    const mockGraphClient = {
      api: () => ({
        header: () => ({
          search: () => ({
            select: () => ({
              top: () => ({
                get: async () => ({ value: MOCK_GROUPS }),
              }),
            }),
          }),
        }),
      }),
    };

    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => mockGraphClient as never);

    const res = await app.request('/api/integrations/m365/groups/search?q=Eng');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      groups: Array<{ external_id: string; display_name: string; mail_nickname: string }>;
    };
    expect(body.groups).toHaveLength(2);
    expect(body.groups[0]).toEqual({
      external_id: 'aaa-111',
      display_name: 'Engineering',
      mail_nickname: 'engineering',
    });
    expect(body.groups[1]).toEqual({
      external_id: 'bbb-222',
      display_name: 'Eng Leads',
      mail_nickname: 'eng-leads',
    });
  });

  it('returns empty groups when q is missing', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => {
      throw new Error('should not be called');
    });

    const res = await app.request('/api/integrations/m365/groups/search');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groups: unknown[] };
    expect(body.groups).toHaveLength(0);
  });

  it('returns empty groups when q is 1 char', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => {
      throw new Error('should not be called');
    });

    const res = await app.request('/api/integrations/m365/groups/search?q=E');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groups: unknown[] };
    expect(body.groups).toHaveLength(0);
  });

  it('returns 403 for non-admin user without planner.group.link.m365', async () => {
    const session = buildSession({
      tenant_id: tenantId,
      user_id: userId,
      roles: ['planner.contributor'],
    });
    const app = buildTestApp(session, async () => {
      throw new Error('should not be called');
    });

    const res = await app.request('/api/integrations/m365/groups/search?q=Eng');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });

  it('returns 400 with VALIDATION when graphClientFor throws M365NotConfiguredError', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => {
      throw new m365.M365NotConfiguredError('not configured');
    });

    const res = await app.request('/api/integrations/m365/groups/search?q=Eng');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION');
  });

  it('returns empty groups when q is stripped to less than 2 chars by sanitization', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => {
      throw new Error('should not be called');
    });

    const res = await app.request('/api/integrations/m365/groups/search?q=%22');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groups: unknown[] };
    expect(body.groups).toHaveLength(0);
  });
});

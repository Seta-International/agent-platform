import { randomUUID } from 'node:crypto';
import { RequestContext } from '@mastra/core/request-context';
import type { ToolExecutionContext } from '@mastra/core/tools';
import type { AgentRequestContext, SessionLike } from '@seta/agent-sdk';
import { rollup } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { getDefaultRegistry, IMPLICIT_PERMISSIONS, resolvePermissions } from '@seta/shared-rbac';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';

export function makeToolContext(actor: {
  user_id: string;
  type?: 'user';
}): ToolExecutionContext<unknown, unknown, AgentRequestContext> {
  const rc = new RequestContext<AgentRequestContext>();
  rc.set('actor', { type: actor.type ?? 'user', user_id: actor.user_id });
  return {
    requestContext: rc,
    toolCallId: 'test-call',
    messages: [],
  } as ToolExecutionContext<unknown, unknown, AgentRequestContext>;
}

export interface TestAssignment {
  role_slug: string;
  scope_kind: 'tenant' | 'org_unit' | 'self' | 'group';
  scope_id?: string | null;
}

/**
 * Builds a SessionLike the same way the real agent session bridge does:
 * assignments → rollup() → role_summary, roles → resolvePermissions() →
 * effective_permissions. Tests express intent as role assignments (what a
 * real caller would hold), not raw permission strings.
 */
export function buildSession(opts?: {
  tenantId?: string;
  userId?: string;
  assignments?: readonly TestAssignment[];
}): SessionLike {
  const tenant_id = opts?.tenantId ?? randomUUID();
  const user_id = opts?.userId ?? randomUUID();
  const role_summary = rollup(
    (opts?.assignments ?? []).map((a) => ({
      role_slug: a.role_slug,
      scope_kind: a.scope_kind,
      scope_id: a.scope_id ?? null,
      granted_at: new Date(),
    })),
  );
  const effective_permissions = resolvePermissions(
    getDefaultRegistry(),
    role_summary.roles,
    IMPLICIT_PERMISSIONS,
  );
  return { tenant_id, user_id, effective_permissions, role_summary };
}

export function withAgentTestDb<T>(
  fn: (ctx: { pool: Pool; databaseUrl: string }) => Promise<T>,
): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      initPools({ databaseUrl });
      try {
        return await fn({ pool, databaseUrl });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

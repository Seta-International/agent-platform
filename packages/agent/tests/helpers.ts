import { RequestContext } from '@mastra/core/request-context';
import type { ToolExecutionContext } from '@mastra/core/tools';
import type { AgentRequestContext } from '@seta/agent-sdk';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
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

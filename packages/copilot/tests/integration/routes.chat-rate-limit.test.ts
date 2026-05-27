import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mastra/ai-sdk', () => ({
  toAISdkStream: () =>
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
}));

import { registerCopilotRoutes } from '../../src/backend/routes.ts';
import { withCopilotTestDb } from '../helpers.ts';

type TestSession = {
  tenant_id: string;
  user_id: string;
  effective_permissions: ReadonlySet<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
};

const fakeMastra = { getStorage: () => null } as never;
const fakePool = {
  connect: async () => {
    throw new Error('no pool in route test');
  },
} as unknown as Pool;

const v6UserMessage = (text: string) => ({
  id: 'm-1',
  role: 'user' as const,
  parts: [{ type: 'text' as const, text }],
});

describe('POST /api/copilot/v1/chat rate-limit reconciliation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('commits actual provider usage after the stream completes', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const supervisor = {
        stream: async () =>
          ({
            totalUsage: Promise.resolve({ inputTokens: 5, outputTokens: 7 }),
          }) as never,
      } as never;

      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set(['copilot.chat.use']),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerCopilotRoutes(app, {
        supervisor,
        domainAgents: {},
        mastra: fakeMastra,
        pool: fakePool,
      });

      const res = await app.request('/api/copilot/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [v6UserMessage('hi')] }),
      });
      expect(res.status).toBe(200);
      await res.text();

      const row = await pool.query<{ tokens_in: number; tokens_out: number }>(
        `SELECT tokens_in, tokens_out
           FROM copilot.rate_limits
          WHERE tenant_id = $1 AND user_id = $2`,
        [tenant_id, admin_user_id],
      );
      expect(row.rows[0]).toMatchObject({ tokens_in: 5, tokens_out: 7 });
    });
  });
});

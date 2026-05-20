import { describe, expect, it } from 'vitest';
import { createAgentFactory } from '../src/backend/agent-factory.ts';
import { buildMastra } from '../src/backend/runtime.ts';
import { withCopilotTestDb } from './test-helpers.ts';

type TestSession = {
  tenant_id: string;
  user_id: string;
  effective_permissions: Set<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
};

const baseSession = (overrides: Partial<TestSession> = {}): TestSession => ({
  tenant_id: 't1',
  user_id: 'u1',
  effective_permissions: new Set([
    'copilot.chat.use',
    'identity.user.read.self',
    'identity.role.read.self',
    'copilot.thread.read.self',
  ]),
  role_summary: { roles: ['member'], cross_tenant_read: false },
  ...overrides,
});

describe('createAgentFactory', () => {
  it('returns the same Agent for two sessions with identical role bundles', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await (mastra.getStorage() as { init: () => Promise<void> }).init();
      const factory = createAgentFactory({ mastra });
      const a = factory(baseSession({ user_id: 'u1' }) as never, 'self');
      const b = factory(baseSession({ user_id: 'u2' }) as never, 'self');
      expect(a).toBe(b);
    });
  });

  it('returns different Agents for different role bundles', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await (mastra.getStorage() as { init: () => Promise<void> }).init();
      const factory = createAgentFactory({ mastra });
      const a = factory(
        baseSession({
          role_summary: { roles: ['member'], cross_tenant_read: false },
        }) as never,
        'self',
      );
      const b = factory(
        baseSession({
          role_summary: { roles: ['admin'], cross_tenant_read: true },
        }) as never,
        'self',
      );
      expect(a).not.toBe(b);
    });
  });

  it('caches router and self under distinct keys', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await (mastra.getStorage() as { init: () => Promise<void> }).init();
      const factory = createAgentFactory({ mastra });
      const session = baseSession();
      const router = factory(session as never, 'router');
      const self = factory(session as never, 'self');
      expect(router).not.toBe(self);
    });
  });
});

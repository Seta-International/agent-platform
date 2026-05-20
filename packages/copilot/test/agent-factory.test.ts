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
  it('returns the same Agent bag for two sessions with identical role bundles', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await (mastra.getStorage() as { init: () => Promise<void> }).init();
      const factory = createAgentFactory({ mastra });
      const a = factory(baseSession({ user_id: 'u1' }) as never).get('self');
      const b = factory(baseSession({ user_id: 'u2' }) as never).get('self');
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
      ).get('self');
      const b = factory(
        baseSession({
          role_summary: { roles: ['admin'], cross_tenant_read: true },
        }) as never,
      ).get('self');
      expect(a).not.toBe(b);
    });
  });

  it('builds every spec in the catalog, keyed by name', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await (mastra.getStorage() as { init: () => Promise<void> }).init();
      const factory = createAgentFactory({ mastra });
      const bag = factory(baseSession() as never);
      expect(bag.names().sort()).toEqual(factory.names.slice().sort());
      for (const name of factory.names) {
        expect(bag.get(name)).toBeDefined();
      }
      expect(factory.names).toContain('self');
      expect(factory.names).toContain('supervisor');
      const supervisor = factory.specs.find((s) => s.name === 'supervisor');
      expect(supervisor?.delegates).toEqual(['self']);
    });
  });
});

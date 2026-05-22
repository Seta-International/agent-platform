import { describe, expect, it, vi } from 'vitest';
import { createContributionRegistry } from '../../src/composition/registry.ts';

describe('reg.module', () => {
  it('records schema + migrations dir + subscribers in one call', () => {
    const reg = createContributionRegistry();
    const fakeSchema = {};
    const sub = {
      subscription: 'planner.demo',
      event: 'demo.event',
      eventVersion: 1,
      handler: async () => {},
    };
    reg.module({
      name: 'planner',
      schema: fakeSchema,
      migrationsDir: '/tmp/planner',
      subscribers: [sub],
    });
    expect(reg.collected.schemas.get('planner')).toBe(fakeSchema);
    expect(reg.collected.migrationDirs).toContainEqual({ module: 'planner', dir: '/tmp/planner' });
    expect(reg.collected.subscribers).toContain(sub);
  });

  it('rejects registering the same module twice', () => {
    const reg = createContributionRegistry();
    reg.module({ name: 'planner', schema: {}, migrationsDir: '/a' });
    expect(() => {
      reg.module({ name: 'planner', schema: {}, migrationsDir: '/b' });
    }).toThrow(/module registered twice: planner/);
  });

  it('rejects duplicate job names across modules', () => {
    const reg = createContributionRegistry();
    reg.module({
      name: 'a',
      schema: {},
      migrationsDir: '/a',
      jobs: { 'shared.job': async () => {} },
    });
    expect(() => {
      reg.module({
        name: 'b',
        schema: {},
        migrationsDir: '/b',
        jobs: { 'shared.job': async () => {} },
      });
    }).toThrow(/duplicate job name: shared\.job/);
  });

  it('rejects duplicate route mountAt across modules', () => {
    const reg = createContributionRegistry();
    reg.module({
      name: 'a',
      schema: {},
      migrationsDir: '/a',
      routes: { mountAt: '/api/a/v1', build: () => undefined as never },
    });
    expect(() => {
      reg.module({
        name: 'b',
        schema: {},
        migrationsDir: '/b',
        routes: { mountAt: '/api/a/v1', build: () => undefined as never },
      });
    }).toThrow(/duplicate route mountAt: \/api\/a\/v1/);
  });

  it('rejects route mountAt not under /api/<module>/v*', () => {
    const reg = createContributionRegistry();
    expect(() => {
      reg.module({
        name: 'planner',
        schema: {},
        migrationsDir: '/a',
        routes: { mountAt: '/api/other/v1', build: () => undefined as never },
      });
    }).toThrow(/route mountAt for planner must start with \/api\/planner\/v/);
  });

  it('rejects duplicate agent tool IDs', () => {
    const reg = createContributionRegistry();
    const tool = {
      id: 'planner.demo',
      description: 'd',
      input: {} as never,
      output: {} as never,
      rbac: [],
      execute: async () => undefined,
    };
    reg.module({ name: 'planner', schema: {}, migrationsDir: '/a', agentTools: [tool] });
    expect(() => {
      reg.module({ name: 'staffing', schema: {}, migrationsDir: '/b', agentTools: [tool] });
    }).toThrow(/duplicate agent tool id: planner\.demo/);
  });

  it('rejects duplicate agent spec IDs', () => {
    const reg = createContributionRegistry();
    const spec = { id: 'planner.demo', instructions: '', tools: [], rbac: [] };
    reg.module({ name: 'planner', schema: {}, migrationsDir: '/a', agentSpecs: [spec] });
    expect(() => {
      reg.module({ name: 'staffing', schema: {}, migrationsDir: '/b', agentSpecs: [spec] });
    }).toThrow(/duplicate agent spec id: planner\.demo/);
  });

  it('rejects duplicate RBAC permission slugs', () => {
    const reg = createContributionRegistry();
    reg.module({ name: 'a', schema: {}, migrationsDir: '/a', rbac: { 'shared.read': 'Read' } });
    expect(() => {
      reg.module({ name: 'b', schema: {}, migrationsDir: '/b', rbac: { 'shared.read': 'Read' } });
    }).toThrow(/duplicate permission slug: shared\.read/);
  });

  it('collects workflow builders in registration order', () => {
    const reg = createContributionRegistry();
    const b1 = vi.fn();
    const b2 = vi.fn();
    const b3 = vi.fn();
    reg.module({ name: 'copilot', schema: {}, migrationsDir: '/a', workflows: [b1, b2] });
    reg.module({ name: 'planner', schema: {}, migrationsDir: '/b', workflows: [b3] });
    expect(reg.collected.workflowBuilders).toEqual([
      { module: 'copilot', builder: b1 },
      { module: 'copilot', builder: b2 },
      { module: 'planner', builder: b3 },
    ]);
  });

  it('collects routes, stream hub builders, error mappers, and rbac/events maps', () => {
    const reg = createContributionRegistry();
    const routeBuild = () => undefined as never;
    const streamBuilder = () => ({ start: () => {}, stop: () => {} });
    const mapper = () => null;
    reg.module({
      name: 'planner',
      schema: {},
      migrationsDir: '/a',
      routes: { mountAt: '/api/planner/v1', build: routeBuild },
      stream: streamBuilder,
      errorMapper: mapper,
      rbac: { 'planner.read': 'Read planner' },
      events: { 'planner.task.created': {} as never },
    });
    expect(reg.collected.routes).toEqual([
      { module: 'planner', mountAt: '/api/planner/v1', build: routeBuild },
    ]);
    expect(reg.collected.streamHubBuilders).toEqual([
      { module: 'planner', builder: streamBuilder },
    ]);
    expect(reg.collected.errorMappers).toEqual([{ module: 'planner', mapper }]);
    expect(reg.collected.rbacByModule.get('planner')).toEqual({ 'planner.read': 'Read planner' });
    expect(reg.collected.eventsByModule.get('planner')).toBeDefined();
  });
});

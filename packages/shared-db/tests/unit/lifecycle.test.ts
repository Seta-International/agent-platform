import { afterEach, describe, expect, it } from 'vitest';
import {
  getLifecycleEntries,
  registerLifecycle,
  resetLifecycleRegistry,
} from '../../src/lifecycle.ts';

afterEach(() => resetLifecycleRegistry());

describe('lifecycle registry', () => {
  it('accumulates entries across register calls', () => {
    registerLifecycle([
      { table: 'core.events', policy: { kind: 'partition-drop', olderThan: '365 days' } },
    ]);
    registerLifecycle([
      {
        table: 'notifications.notifications',
        policy: { kind: 'ttl', column: 'created_at', olderThan: '180 days' },
      },
    ]);
    expect(getLifecycleEntries().map((e) => e.table)).toEqual([
      'core.events',
      'notifications.notifications',
    ]);
  });

  it('rejects duplicate table registration', () => {
    registerLifecycle([{ table: 'core.events', policy: { kind: 'permanent' } }]);
    expect(() =>
      registerLifecycle([{ table: 'core.events', policy: { kind: 'permanent' } }]),
    ).toThrow(/already registered/);
  });

  it('rejects malformed table names', () => {
    expect(() =>
      registerLifecycle([{ table: 'no_schema', policy: { kind: 'permanent' } }]),
    ).toThrow(/schema\.table/);
  });
});

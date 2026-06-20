import { describe, expect, it } from 'vitest';
import { PM_ACCOUNT_CREATED, PM_EVENTS } from '../../src/events.ts';

describe('pm events', () => {
  it('declares only pm.account.created with a valid payload schema', () => {
    expect(Object.keys(PM_EVENTS)).toEqual([PM_ACCOUNT_CREATED]);
    const parsed = PM_EVENTS[PM_ACCOUNT_CREATED].safeParse({
      account_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
    });
    expect(parsed.success).toBe(true);
  });
});

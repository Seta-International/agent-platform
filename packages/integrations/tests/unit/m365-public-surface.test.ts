import { describe, expect, it } from 'vitest';
import { m365 } from '../../src/index.ts';

describe('m365 public surface', () => {
  it('exposes the expected callables', () => {
    expect(typeof m365.buildGraphClient).toBe('function');
    expect(typeof m365.runPullGroup).toBe('function');
    expect(typeof m365.runPushGroup).toBe('function');
    expect(typeof m365.buildWebhookRouter).toBe('function');
    expect(typeof m365.buildM365Subscribers).toBe('function');
    expect(typeof m365.createM365GroupLinkRepo).toBe('function');
    expect(typeof m365.createM365SubscriptionsRepo).toBe('function');
    expect(typeof m365.runCreateSubscription).toBe('function');
    expect(typeof m365.runRenewSubscription).toBe('function');
    expect(typeof m365.acquireToken).toBe('function');
    expect(typeof m365.buildSystemSession).toBe('function');
    expect(m365.M365NotConfiguredError).toBeDefined();
  });
});

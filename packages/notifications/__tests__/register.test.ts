import { createContributionRegistry } from '@seta/core';
import { describe, expect, it } from 'vitest';
import { registerNotificationsContributions } from '../src/register.ts';

describe('registerNotificationsContributions', () => {
  it('registers the notifications.notifier.deliver subscriber', () => {
    const reg = createContributionRegistry();
    registerNotificationsContributions(reg);
    const subs = Array.from(reg.collected.subscribers);
    const names = subs.map((s) => s.subscription);
    expect(names).toContain('notifications.notifier.deliver');
  });
});

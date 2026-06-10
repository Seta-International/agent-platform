import { describe, expect, it } from 'vitest';
import { budgetAlertNotificationId } from '../../src/backend/notification-id.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TENANT = '00000000-0000-0000-0000-0000000000aa';

describe('budgetAlertNotificationId', () => {
  it('produces a valid v5 UUID', () => {
    const id = budgetAlertNotificationId(TENANT, 'day', '2026-06-10', 80);
    expect(id).toMatch(UUID_RE);
    expect(id[14]).toBe('5'); // version nibble
  });

  it('is deterministic for the same tenant/period/threshold', () => {
    const a = budgetAlertNotificationId(TENANT, 'day', '2026-06-10', 80);
    const b = budgetAlertNotificationId(TENANT, 'day', '2026-06-10', 80);
    expect(a).toBe(b);
  });

  it('differs by threshold, period type, period key, and tenant', () => {
    const base = budgetAlertNotificationId(TENANT, 'day', '2026-06-10', 80);
    expect(budgetAlertNotificationId(TENANT, 'day', '2026-06-10', 100)).not.toBe(base);
    expect(budgetAlertNotificationId(TENANT, 'month', '2026-06-10', 80)).not.toBe(base);
    expect(budgetAlertNotificationId(TENANT, 'day', '2026-06-11', 80)).not.toBe(base);
    expect(
      budgetAlertNotificationId('00000000-0000-0000-0000-0000000000bb', 'day', '2026-06-10', 80),
    ).not.toBe(base);
  });
});

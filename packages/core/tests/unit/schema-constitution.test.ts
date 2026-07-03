import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  coreSubscriptionFailureState,
  coreSubscriptionProcessed,
  outgoingEmails,
} from '../../src/db/schema/index.ts';

describe('core schema constitution', () => {
  it('subscription_processed declares its composite PK', () => {
    const cfg = getTableConfig(coreSubscriptionProcessed);
    expect(cfg.primaryKeys).toHaveLength(1);
    expect(cfg.primaryKeys[0]?.columns.map((c) => c.name).sort()).toEqual([
      'event_id',
      'subscription',
    ]);
  });

  it('subscription_failure_state.event_id is uuid', () => {
    const col = getTableConfig(coreSubscriptionFailureState).columns.find(
      (c) => c.name === 'event_id',
    );
    expect(col?.getSQLType()).toBe('uuid');
  });

  it('outgoing_emails.status carries a CHECK constraint', () => {
    const cfg = getTableConfig(outgoingEmails);
    expect(cfg.checks.some((c) => c.name === 'outgoing_emails_status_check')).toBe(true);
  });

  it('outgoing_emails.transport_kind carries a CHECK constraint', () => {
    const cfg = getTableConfig(outgoingEmails);
    expect(cfg.checks.some((c) => c.name === 'outgoing_emails_transport_kind_check')).toBe(true);
  });
});

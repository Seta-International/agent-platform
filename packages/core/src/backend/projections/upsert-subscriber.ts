import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

/**
 * Build the [created, updated] SubscriberDef pair for an event-sourced read-model
 * projection: idempotent insert…onConflictDoUpdate keyed on `conflictTarget`. The
 * update set is every column from `toRow` except the conflict target and `tenant_id`
 * (immutable per aggregate). `updated_at` is not written here — projection tables that
 * need it carry a touch trigger that bumps it on the UPDATE.
 *
 * Lives in core as a pure mechanism: the pm-event coupling stays at the call site so
 * core never imports a feature module.
 */
export function makeProjectionUpsertSubscribers<P>(opts: {
  subscriptionPrefix: string;
  createEvent: string;
  updateEvent: string;
  table: PgTable;
  conflictTarget: PgColumn;
  toRow: (payload: P) => Record<string, unknown>;
}): [SubscriberDef, SubscriberDef] {
  const targetName = opts.conflictTarget.name;

  const upsert = async (event: DomainEvent<P>, ctx: SubscriberCtx): Promise<void> => {
    const row = opts.toRow(event.payload);
    const set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key !== targetName && key !== 'tenant_id') set[key] = value;
    }
    // Drizzle erases the concrete row/column types behind the generic PgTable; the
    // typed boundary is `toRow`, so the localized casts here are safe.
    await ctx.tx
      .insert(opts.table)
      .values(row as never)
      .onConflictDoUpdate({ target: opts.conflictTarget, set: set as never });
  };

  return [
    {
      subscription: `${opts.subscriptionPrefix}.created`,
      event: opts.createEvent,
      eventVersion: 1,
      handler: (event, ctx) => upsert(event as DomainEvent<P>, ctx),
    },
    {
      subscription: `${opts.subscriptionPrefix}.updated`,
      event: opts.updateEvent,
      eventVersion: 1,
      handler: (event, ctx) => upsert(event as DomainEvent<P>, ctx),
    },
  ];
}

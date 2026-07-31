import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';

interface OrgUnitCreatedPayload {
  org_unit_id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
}

interface OrgUnitUpdatedPayload {
  org_unit_id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  head_worker_id: string | null;
}

interface OrgUnitDeletedPayload {
  org_unit_id: string;
  tenant_id: string;
}

function pgClient(tx: SubscriberCtx['tx']): {
  query(text: string, values?: unknown[]): Promise<unknown>;
} {
  const session = (tx as unknown as { session?: { client?: unknown } }).session;
  if (session?.client) {
    return session.client as { query(text: string, values?: unknown[]): Promise<unknown> };
  }
  return tx as unknown as { query(text: string, values?: unknown[]): Promise<unknown> };
}

// Both upsert handlers write through this shape: an INSERT for the never-seen-before case, or
// an UPDATE gated on (a) the row not already tombstoned and (b) the stored tenant matching the
// incoming one. The three subscribers below have no ordering relationship with each other (each
// drains on its own per-subscription cursor/backoff — see core/runtime/dispatcher/drain.ts), so
// a late create/update racing a tombstone must never resurrect or cross-tenant-clobber the row.
const UPSERT_SQL = `INSERT INTO identity.org_unit_projection (org_unit_id, tenant_id, parent_id, name)
   VALUES ($1, $2, $3, $4)
   ON CONFLICT (org_unit_id) DO UPDATE SET
     parent_id = EXCLUDED.parent_id,
     name = EXCLUDED.name,
     updated_at = NOW()
   WHERE org_unit_projection.deleted_at IS NULL
     AND org_unit_projection.tenant_id = EXCLUDED.tenant_id`;

const upsertOnCreated: SubscriberDef = {
  subscription: 'identity.org-unit-projection.upsert-on-created',
  event: 'people.org_unit.created',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<OrgUnitCreatedPayload>;
    await pgClient(ctx.tx).query(UPSERT_SQL, [
      e.payload.org_unit_id,
      e.payload.tenant_id,
      e.payload.parent_id,
      e.payload.name,
    ]);
  },
};

const upsertOnUpdated: SubscriberDef = {
  subscription: 'identity.org-unit-projection.upsert-on-updated',
  event: 'people.org_unit.updated',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<OrgUnitUpdatedPayload>;
    await pgClient(ctx.tx).query(UPSERT_SQL, [
      e.payload.org_unit_id,
      e.payload.tenant_id,
      e.payload.parent_id,
      e.payload.name,
    ]);
  },
};

const deleteOnDeleted: SubscriberDef = {
  subscription: 'identity.org-unit-projection.delete-on-deleted',
  event: 'people.org_unit.deleted',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<OrgUnitDeletedPayload>;
    // Tombstone, not a hard delete: the three subscribers in this file have no ordering
    // relationship (per-subscription cursor + independent backoff in drain.ts), so a delete
    // can drain before its own create. A hard DELETE here would silently no-op and let the
    // later INSERT ... ON CONFLICT permanently resurrect the row. Writing a tombstone instead
    // means whichever event lands second, the WHERE guards above/below converge on "deleted".
    await pgClient(ctx.tx).query(
      `INSERT INTO identity.org_unit_projection (org_unit_id, tenant_id, deleted_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (org_unit_id) DO UPDATE SET deleted_at = NOW()
       WHERE org_unit_projection.tenant_id = EXCLUDED.tenant_id`,
      [e.payload.org_unit_id, e.payload.tenant_id],
    );
  },
};

export const orgUnitProjectionSubscribers: SubscriberDef[] = [
  upsertOnCreated,
  upsertOnUpdated,
  deleteOnDeleted,
];

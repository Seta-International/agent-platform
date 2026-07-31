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

const upsertOnCreated: SubscriberDef = {
  subscription: 'identity.org-unit-projection.upsert-on-created',
  event: 'people.org_unit.created',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<OrgUnitCreatedPayload>;
    await pgClient(ctx.tx).query(
      `INSERT INTO identity.org_unit_projection (org_unit_id, tenant_id, parent_id, name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (org_unit_id) DO UPDATE SET
         parent_id = EXCLUDED.parent_id,
         name = EXCLUDED.name,
         updated_at = NOW()`,
      [e.payload.org_unit_id, e.payload.tenant_id, e.payload.parent_id, e.payload.name],
    );
  },
};

const upsertOnUpdated: SubscriberDef = {
  subscription: 'identity.org-unit-projection.upsert-on-updated',
  event: 'people.org_unit.updated',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<OrgUnitUpdatedPayload>;
    await pgClient(ctx.tx).query(
      `INSERT INTO identity.org_unit_projection (org_unit_id, tenant_id, parent_id, name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (org_unit_id) DO UPDATE SET
         parent_id = EXCLUDED.parent_id,
         name = EXCLUDED.name,
         updated_at = NOW()`,
      [e.payload.org_unit_id, e.payload.tenant_id, e.payload.parent_id, e.payload.name],
    );
  },
};

const deleteOnDeleted: SubscriberDef = {
  subscription: 'identity.org-unit-projection.delete-on-deleted',
  event: 'people.org_unit.deleted',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<OrgUnitDeletedPayload>;
    await pgClient(ctx.tx).query(
      `DELETE FROM identity.org_unit_projection WHERE org_unit_id = $1 AND tenant_id = $2`,
      [e.payload.org_unit_id, e.payload.tenant_id],
    );
  },
};

export const orgUnitProjectionSubscribers: SubscriberDef[] = [
  upsertOnCreated,
  upsertOnUpdated,
  deleteOnDeleted,
];

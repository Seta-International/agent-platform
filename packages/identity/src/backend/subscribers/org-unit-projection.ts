import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';

interface OrgUnitCreatedPayload {
  org_unit_id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
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

export const orgUnitProjectionSubscribers: SubscriberDef[] = [upsertOnCreated];

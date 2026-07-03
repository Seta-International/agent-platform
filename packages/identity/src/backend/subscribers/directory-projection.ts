import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';

// ── Local payload types ──────────────────────────────────────────────────────

interface CreatedPayload {
  person_id: string;
  tenant_id: string;
  full_name: string;
  work_email: string | null;
  job_title: string | null;
}

interface UpdatedPayload extends CreatedPayload {
  fields: string[];
}

interface LifecyclePayload {
  person_id: string;
  tenant_id: string;
}

// ── pgClient helper ──────────────────────────────────────────────────────────

function pgClient(tx: SubscriberCtx['tx']): {
  query(text: string, values?: unknown[]): Promise<unknown>;
} {
  const session = (tx as unknown as { session?: { client?: unknown } }).session;
  if (session?.client) {
    return session.client as { query(text: string, values?: unknown[]): Promise<unknown> };
  }
  return tx as unknown as { query(text: string, values?: unknown[]): Promise<unknown> };
}

// ── Subscribers ──────────────────────────────────────────────────────────────

const upsertOnCreated: SubscriberDef = {
  subscription: 'identity.directory.upsert-on-worker-created',
  event: 'people.worker.created',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<CreatedPayload>;
    await pgClient(ctx.tx).query(
      `INSERT INTO identity.person_projection (person_id, tenant_id, full_name, work_email, job_title, employment_status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (person_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         work_email = EXCLUDED.work_email,
         job_title = EXCLUDED.job_title,
         updated_at = NOW()`,
      [
        e.payload.person_id,
        e.payload.tenant_id,
        e.payload.full_name,
        e.payload.work_email,
        e.payload.job_title,
      ],
    );
  },
};

const upsertOnUpdated: SubscriberDef = {
  subscription: 'identity.directory.upsert-on-worker-updated',
  event: 'people.worker.updated',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<UpdatedPayload>;
    await pgClient(ctx.tx).query(
      `INSERT INTO identity.person_projection (person_id, tenant_id, full_name, work_email, job_title, employment_status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (person_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         work_email = EXCLUDED.work_email,
         job_title = EXCLUDED.job_title,
         updated_at = NOW()`,
      [
        e.payload.person_id,
        e.payload.tenant_id,
        e.payload.full_name,
        e.payload.work_email,
        e.payload.job_title,
      ],
    );
  },
};

const terminateSub: SubscriberDef = {
  subscription: 'identity.directory.flip-terminated',
  event: 'people.worker.terminated',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<LifecyclePayload>;
    await pgClient(ctx.tx).query(
      `UPDATE identity.person_projection
       SET employment_status = 'terminated', updated_at = NOW()
       WHERE person_id = $1`,
      [e.payload.person_id],
    );
  },
};

const reinstateSub: SubscriberDef = {
  subscription: 'identity.directory.flip-reinstated',
  event: 'people.worker.reinstated',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<LifecyclePayload>;
    await pgClient(ctx.tx).query(
      `UPDATE identity.person_projection
       SET employment_status = 'active', updated_at = NOW()
       WHERE person_id = $1`,
      [e.payload.person_id],
    );
  },
};

export const directoryProjectionSubscribers: SubscriberDef[] = [
  upsertOnCreated,
  upsertOnUpdated,
  terminateSub,
  reinstateSub,
];

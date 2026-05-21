import type { DomainEvent, NodeTx, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { sql } from 'drizzle-orm';
import { createM365GroupLinkRepo } from './repo.ts';

// Minimal payload shapes for the three planner events we handle.
// Typed locally to avoid importing from @seta/planner/events (stay within public surface rules).
interface GroupUpdatedPayload {
  actor: { type?: string; system_id?: string };
  group_id: string;
  changed_fields: string[];
}

interface GroupDeletedPayload {
  group_id: string;
}

interface MemberRoleChangedPayload {
  actor?: { type?: string; system_id?: string };
  group_id: string;
}

// Sync-internal fields — changes to these come from the sync machinery itself
// and must not trigger a push job (they are not user-facing edits).
const SYNC_INTERNAL_FIELDS = new Set(['external_source', 'external_id', 'external_synced_at']);

// The system actor's system_id used by buildSystemSession to represent M365 sync writes.
// Matching on this prevents the subscriber from re-enqueueing after a remote-wins apply.
const M365_SYSTEM_ID = 'integrations.m365';

interface PushJobPayload {
  tenant_id: string;
  group_id: string;
  changed_fields: string[];
}

/**
 * Enqueues a graphile-worker job in the same transaction as the subscriber's
 * other writes. graphile_worker.add_job lives in the same Postgres database,
 * so the enqueue is atomic with the rest of the handler's work.
 */
async function enqueueJob(tx: NodeTx, identifier: string, payload: PushJobPayload): Promise<void> {
  // sql.raw inside json() encodes the payload as a JSON literal. Using sql.param for the
  // identifier avoids injection; the payload is constructed internally (no user input).
  await tx.execute(
    sql`SELECT graphile_worker.add_job(${identifier}::text, ${JSON.stringify(payload)}::json)`,
  );
}

async function handleGroupUpdated(
  event: DomainEvent<GroupUpdatedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const payload = event.payload;

  // Skip-loop guard: if the event was emitted by the M365 sync system actor (e.g. during a
  // remote-wins updateGroup call), enqueueing another push would create an infinite cycle.
  const actor = payload.actor as { type?: string; system_id?: string };
  if (actor?.type === 'system' && actor.system_id === M365_SYSTEM_ID) return;

  // ctx.tx is a NodeTx (drizzle NodePgDatabase at a specific transaction level).
  // createM365GroupLinkRepo expects NodePgDatabase<typeof schema>; NodeTx is structurally
  // compatible for the select/update operations we perform here.
  // biome-ignore lint/suspicious/noExplicitAny: NodeTx generic param omits schema, structurally compatible
  const repo = createM365GroupLinkRepo({ db: ctx.tx as any });

  const link = await repo.findByGroup(payload.group_id);
  if (!link) return;

  const relevantFields = (payload.changed_fields as string[]).filter(
    (f) => !SYNC_INTERNAL_FIELDS.has(f),
  );
  if (relevantFields.length === 0) return;

  await enqueueJob(ctx.tx, 'm365.group.push', {
    tenant_id: event.tenantId,
    group_id: payload.group_id,
    changed_fields: relevantFields,
  });
}

async function handleGroupDeleted(
  event: DomainEvent<GroupDeletedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const payload = event.payload;

  // biome-ignore lint/suspicious/noExplicitAny: NodeTx generic param omits schema, structurally compatible
  const repo = createM365GroupLinkRepo({ db: ctx.tx as any });

  const link = await repo.findByGroup(payload.group_id);
  if (!link) return;

  // Tombstone the link — do NOT enqueue a push. The planner group is already gone;
  // pushing a deletion to Graph is a separate concern (deferred until a graph-delete job lands).
  await repo.tombstone(link.id);
}

async function handleMemberRoleChanged(
  event: DomainEvent<MemberRoleChangedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const payload = event.payload;

  // Skip-loop guard: set-member-role emits with system actor when called by the sync machinery;
  // re-enqueueing here would create an infinite push cycle.
  if (payload.actor?.type === 'system' && payload.actor.system_id === M365_SYSTEM_ID) return;

  // biome-ignore lint/suspicious/noExplicitAny: NodeTx generic param omits schema, structurally compatible
  const repo = createM365GroupLinkRepo({ db: ctx.tx as any });

  const link = await repo.findByGroup(payload.group_id);
  if (!link) return;

  await enqueueJob(ctx.tx, 'm365.group.push', {
    tenant_id: event.tenantId,
    group_id: payload.group_id,
    changed_fields: ['members'],
  });
}

export function buildM365Subscribers(): SubscriberDef[] {
  return [
    {
      event: 'planner.group.updated',
      eventVersion: 1,
      subscription: 'integrations.m365.group-updated',
      handler: handleGroupUpdated as SubscriberDef['handler'],
    },
    {
      event: 'planner.group.deleted',
      eventVersion: 1,
      subscription: 'integrations.m365.group-deleted',
      handler: handleGroupDeleted as SubscriberDef['handler'],
    },
    {
      event: 'planner.group.member.role-changed',
      eventVersion: 1,
      subscription: 'integrations.m365.group-member-role-changed',
      handler: handleMemberRoleChanged as SubscriberDef['handler'],
    },
  ];
}

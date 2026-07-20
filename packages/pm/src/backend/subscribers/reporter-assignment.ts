import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { PM_PROJECT_ACCESS_CHANGED } from '../../events.ts';
import { projectionAppliedEvent, reporterAssignment } from '../db/schema.ts';

/** Payload both emit sites (setProjectAccess, decide-charter) broadcast: a full snapshot of
 * the project's owner set at the moment of the change. */
export interface ProjectAccessChanged {
  project_id: string;
  tenant_id: string;
  owner_worker_ids: string[];
}

const SUBSCRIPTION = 'pm.reporter-assignment.access-changed';

/**
 * Temporal Reporter→Project projection (FUT-610). Each access-changed event carries the full
 * owner snapshot, so the handler diffs it against the open rows: new owners open a row at the
 * event's occurredAt, missing owners close theirs. Idempotency is keyed on event id via
 * projection_applied_event — a redelivered (or replayed) event is skipped outright, which
 * also protects the projection from a stale snapshot re-applying out of order.
 */
export const reporterAssignmentOnAccessChanged: SubscriberDef = {
  subscription: SUBSCRIPTION,
  event: PM_PROJECT_ACCESS_CHANGED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const { project_id, tenant_id, owner_worker_ids } = (event as DomainEvent<ProjectAccessChanged>)
      .payload;

    const applied = await ctx.tx
      .insert(projectionAppliedEvent)
      .values({ subscription: SUBSCRIPTION, event_id: event.id, tenant_id })
      .onConflictDoNothing()
      .returning({ event_id: projectionAppliedEvent.event_id });
    if (applied.length === 0) return; // already applied — at-least-once delivery

    const at = event.occurredAt;
    const open = await ctx.tx
      .select({ id: reporterAssignment.id, person_id: reporterAssignment.person_id })
      .from(reporterAssignment)
      .where(
        and(
          eq(reporterAssignment.tenant_id, tenant_id),
          eq(reporterAssignment.project_id, project_id),
          isNull(reporterAssignment.valid_to),
        ),
      );
    const openByPerson = new Map(open.map((r) => [r.person_id, r.id]));
    const desired = new Set(owner_worker_ids);

    const toClose = open.filter((r) => !desired.has(r.person_id)).map((r) => r.id);
    if (toClose.length > 0) {
      await ctx.tx
        .update(reporterAssignment)
        .set({ valid_to: at })
        .where(inArray(reporterAssignment.id, toClose));
    }

    const toOpen = owner_worker_ids.filter((p) => !openByPerson.has(p));
    if (toOpen.length > 0) {
      await ctx.tx.insert(reporterAssignment).values(
        toOpen.map((person_id) => ({
          tenant_id,
          project_id,
          person_id,
          valid_from: at,
          source_event_id: event.id,
        })),
      );
    }
  },
};

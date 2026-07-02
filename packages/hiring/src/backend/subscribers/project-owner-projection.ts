import type { ProjectAccessChangedPayload } from '@seta/pm/events';
import { PM_PROJECT_ACCESS_CHANGED } from '@seta/pm/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { projectOwnerProjection } from '../db/schema.ts';

// pm.project.access.changed always carries the *current* full owner set for the project, so
// each delivery replaces this project's rows wholesale (handles grants and revokes alike).
// Idempotent (at-least-once delivery): re-applying the same set is a no-op.
async function replaceOwners(
  event: DomainEvent<ProjectAccessChangedPayload>,
  ctx: { tx: Parameters<SubscriberDef['handler']>[1]['tx'] },
): Promise<void> {
  const { project_id, tenant_id, owner_worker_ids } = event.payload;
  await ctx.tx
    .delete(projectOwnerProjection)
    .where(eq(projectOwnerProjection.project_id, project_id));
  if (owner_worker_ids.length === 0) return;
  await ctx.tx
    .insert(projectOwnerProjection)
    .values(owner_worker_ids.map((worker_id) => ({ project_id, tenant_id, worker_id })))
    .onConflictDoNothing();
}

export const projectOwnerProjectionAccessChanged: SubscriberDef = {
  subscription: 'hiring.project-owner-projection.access-changed',
  event: PM_PROJECT_ACCESS_CHANGED,
  eventVersion: 1,
  handler: (event, ctx) => replaceOwners(event as DomainEvent<ProjectAccessChangedPayload>, ctx),
};

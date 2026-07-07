import type { ProjectCreatedPayload, ProjectUpdatedPayload } from '@seta/pm/events';
import { PM_PROJECT_CREATED, PM_PROJECT_UPDATED } from '@seta/pm/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { projectProjection } from '../db/schema.ts';

// Local {project_id -> name} read-model so requisitions can show the project name without
// a cross-module join. Idempotent upsert (at-least-once delivery).
async function upsert(
  event: DomainEvent<ProjectCreatedPayload | ProjectUpdatedPayload>,
  ctx: { tx: Parameters<SubscriberDef['handler']>[1]['tx'] },
): Promise<void> {
  const { project_id, tenant_id, account_id, name } = event.payload;
  await ctx.tx
    .insert(projectProjection)
    .values({ project_id, tenant_id, account_id, name })
    .onConflictDoUpdate({ target: projectProjection.project_id, set: { account_id, name } });
}

export const projectProjectionCreated: SubscriberDef = {
  subscription: 'hiring.project-projection.created',
  event: PM_PROJECT_CREATED,
  eventVersion: 1,
  handler: (event, ctx) => upsert(event as DomainEvent<ProjectCreatedPayload>, ctx),
};

export const projectProjectionUpdated: SubscriberDef = {
  subscription: 'hiring.project-projection.updated',
  event: PM_PROJECT_UPDATED,
  eventVersion: 1,
  handler: (event, ctx) => upsert(event as DomainEvent<ProjectUpdatedPayload>, ctx),
};

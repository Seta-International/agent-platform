import type { ProjectCreatedPayload, ProjectUpdatedPayload } from '@seta/pm/events';
import { PM_PROJECT_CREATED, PM_PROJECT_UPDATED } from '@seta/pm/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { projectProjection } from '../db/schema.ts';

export const projectProjectionCreated: SubscriberDef = {
  subscription: 'people.project-projection.created',
  event: PM_PROJECT_CREATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<ProjectCreatedPayload>;
    const { project_id, tenant_id, account_id, name } = e.payload;

    await ctx.tx
      .insert(projectProjection)
      .values({ project_id, tenant_id, account_id, name })
      .onConflictDoUpdate({
        target: projectProjection.project_id,
        set: { account_id, name, updated_at: new Date() },
      });
  },
};

export const projectProjectionUpdated: SubscriberDef = {
  subscription: 'people.project-projection.updated',
  event: PM_PROJECT_UPDATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<ProjectUpdatedPayload>;
    const { project_id, tenant_id, account_id, name } = e.payload;

    await ctx.tx
      .insert(projectProjection)
      .values({ project_id, tenant_id, account_id, name })
      .onConflictDoUpdate({
        target: projectProjection.project_id,
        set: { account_id, name, updated_at: new Date() },
      });
  },
};

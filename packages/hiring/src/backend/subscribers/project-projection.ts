import { makeProjectionUpsertSubscribers } from '@seta/core';
import type { ProjectCreatedPayload, ProjectUpdatedPayload } from '@seta/pm/events';
import { PM_PROJECT_CREATED, PM_PROJECT_UPDATED } from '@seta/pm/events';
import { projectProjection } from '../db/schema.ts';

export const [projectProjectionCreated, projectProjectionUpdated] = makeProjectionUpsertSubscribers<
  ProjectCreatedPayload | ProjectUpdatedPayload
>({
  subscriptionPrefix: 'hiring.project-projection',
  createEvent: PM_PROJECT_CREATED,
  updateEvent: PM_PROJECT_UPDATED,
  table: projectProjection,
  conflictTarget: projectProjection.project_id,
  toRow: (p) => ({
    project_id: p.project_id,
    tenant_id: p.tenant_id,
    account_id: p.account_id,
    name: p.name,
    date_to: p.date_to,
  }),
});

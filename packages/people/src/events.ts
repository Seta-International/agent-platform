import { z } from 'zod';

export const PEOPLE_WORKER_CREATED = 'people.worker.created';
export const PEOPLE_WORKER_UPDATED = 'people.worker.updated';

export const workerCreatedPayload = z.object({
  worker_id: z.string().uuid(),
  person_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  full_name: z.string(),
  work_email: z.string().nullable(),
  job_title: z.string().nullable(),
});
export type WorkerCreatedPayload = z.infer<typeof workerCreatedPayload>;

export const workerUpdatedPayload = z.object({
  worker_id: z.string().uuid(),
  person_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  fields: z.array(z.string()),
  full_name: z.string(),
  work_email: z.string().nullable(),
  job_title: z.string().nullable(),
});
export type WorkerUpdatedPayload = z.infer<typeof workerUpdatedPayload>;

export const workerPortalAccessChangedPayload = z.object({
  worker_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  enabled: z.boolean(),
});
export type WorkerPortalAccessChangedPayload = z.infer<typeof workerPortalAccessChangedPayload>;

export const personSkillAddedPayload = z.object({
  person_id: z.string().uuid(),
  skill_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type PersonSkillAddedPayload = z.infer<typeof personSkillAddedPayload>;

export const personSkillRemovedPayload = z.object({
  person_id: z.string().uuid(),
  skill_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type PersonSkillRemovedPayload = z.infer<typeof personSkillRemovedPayload>;

export const workerLifecyclePayload = z.object({
  worker_id: z.string().uuid(),
  person_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type WorkerLifecyclePayload = z.infer<typeof workerLifecyclePayload>;

export const PEOPLE_EVENTS = {
  [PEOPLE_WORKER_CREATED]: workerCreatedPayload,
  [PEOPLE_WORKER_UPDATED]: workerUpdatedPayload,
  'people.worker.portal_access.changed': workerPortalAccessChangedPayload,
  'people.person.skill.added': personSkillAddedPayload,
  'people.person.skill.removed': personSkillRemovedPayload,
  'people.worker.terminated': workerLifecyclePayload,
  'people.worker.reinstated': workerLifecyclePayload,
} as const satisfies Record<string, z.ZodSchema>;

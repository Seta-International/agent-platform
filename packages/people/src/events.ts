import { z } from 'zod';

export const workerCreatedPayload = z.object({
  worker_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type WorkerCreatedPayload = z.infer<typeof workerCreatedPayload>;

export const workerUpdatedPayload = z.object({
  worker_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  fields: z.array(z.string()),
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

export const PEOPLE_EVENTS = {
  'people.worker.created': workerCreatedPayload,
  'people.worker.updated': workerUpdatedPayload,
  'people.worker.portal_access.changed': workerPortalAccessChangedPayload,
  'people.person.skill.added': personSkillAddedPayload,
  'people.person.skill.removed': personSkillRemovedPayload,
} as const satisfies Record<string, z.ZodSchema>;

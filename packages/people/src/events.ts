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

export const personSkillLevelSetPayload = z.object({
  person_id: z.string().uuid(),
  skill_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  level: z.number().int().min(1).max(5).nullable(),
});
export type PersonSkillLevelSetPayload = z.infer<typeof personSkillLevelSetPayload>;

export const workerLifecyclePayload = z.object({
  worker_id: z.string().uuid(),
  person_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type WorkerLifecyclePayload = z.infer<typeof workerLifecyclePayload>;

export const PEOPLE_ORG_UNIT_CREATED = 'people.org_unit.created';

export const orgUnitCreatedPayload = z.object({
  org_unit_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable(),
  name: z.string(),
});
export type OrgUnitCreatedPayload = z.infer<typeof orgUnitCreatedPayload>;

export const PEOPLE_ORG_UNIT_UPDATED = 'people.org_unit.updated';

export const orgUnitUpdatedPayload = z.object({
  org_unit_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  parent_id: z.string().uuid().nullable(),
  head_worker_id: z.string().uuid().nullable(),
});
export type OrgUnitUpdatedPayload = z.infer<typeof orgUnitUpdatedPayload>;

export const PEOPLE_ORG_UNIT_DELETED = 'people.org_unit.deleted';

export const orgUnitDeletedPayload = z.object({
  org_unit_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type OrgUnitDeletedPayload = z.infer<typeof orgUnitDeletedPayload>;

export const PEOPLE_WORKER_USER_LINKED = 'people.worker.user_linked';

export const workerUserLinkedPayload = z.object({
  worker_id: z.string().uuid(),
  person_id: z.string().uuid(),
  user_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type WorkerUserLinkedPayload = z.infer<typeof workerUserLinkedPayload>;

export const PEOPLE_PERFORMANCE_CONFIG_SAVED = 'people.performance.config.saved';

export const performanceConfigSavedPayload = z.object({
  account_id: z.string().uuid(),
  revision_id: z.string().uuid(),
  revision_no: z.number().int().positive(),
  base_revision_no: z.number().int().positive(),
});
export type PerformanceConfigSavedPayload = z.infer<typeof performanceConfigSavedPayload>;

export const PEOPLE_EVENTS = {
  [PEOPLE_WORKER_CREATED]: workerCreatedPayload,
  [PEOPLE_WORKER_UPDATED]: workerUpdatedPayload,
  'people.person.skill.added': personSkillAddedPayload,
  'people.person.skill.removed': personSkillRemovedPayload,
  'people.person.skill.level.set': personSkillLevelSetPayload,
  'people.worker.terminated': workerLifecyclePayload,
  'people.worker.reinstated': workerLifecyclePayload,
  [PEOPLE_ORG_UNIT_CREATED]: orgUnitCreatedPayload,
  [PEOPLE_ORG_UNIT_UPDATED]: orgUnitUpdatedPayload,
  [PEOPLE_ORG_UNIT_DELETED]: orgUnitDeletedPayload,
  [PEOPLE_WORKER_USER_LINKED]: workerUserLinkedPayload,
  [PEOPLE_PERFORMANCE_CONFIG_SAVED]: performanceConfigSavedPayload,
} as const satisfies Record<string, z.ZodSchema>;

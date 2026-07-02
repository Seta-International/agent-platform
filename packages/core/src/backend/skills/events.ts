import { z } from 'zod';

const uuid = z.string().uuid();

export const skillCategoryEventPayload = z.object({ category_id: uuid, tenant_id: uuid });
export const skillEventPayload = z.object({
  skill_id: uuid,
  category_id: uuid,
  tenant_id: uuid,
});
export const skillRenamedEventPayload = z.object({
  skill_id: uuid,
  name: z.string(),
  previous_name: z.string(),
});

export const CORE_SKILL_CATEGORY_CREATED = 'core.skill_category.created';
export const CORE_SKILL_CATEGORY_UPDATED = 'core.skill_category.updated';
export const CORE_SKILL_CATEGORY_ARCHIVED = 'core.skill_category.archived';
export const CORE_SKILL_CREATED = 'core.skill.created';
export const CORE_SKILL_UPDATED = 'core.skill.updated';
export const CORE_SKILL_ARCHIVED = 'core.skill.archived';
export const CORE_SKILL_RENAMED = 'core.skill.renamed';

export const CORE_SKILL_EVENTS = {
  [CORE_SKILL_CATEGORY_CREATED]: skillCategoryEventPayload,
  [CORE_SKILL_CATEGORY_UPDATED]: skillCategoryEventPayload,
  [CORE_SKILL_CATEGORY_ARCHIVED]: skillCategoryEventPayload,
  [CORE_SKILL_CREATED]: skillEventPayload,
  [CORE_SKILL_UPDATED]: skillEventPayload,
  [CORE_SKILL_ARCHIVED]: skillEventPayload,
  [CORE_SKILL_RENAMED]: skillRenamedEventPayload,
} as const satisfies Record<string, z.ZodSchema>;

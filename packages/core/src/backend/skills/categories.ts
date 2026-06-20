import { and, asc, eq } from 'drizzle-orm';
import { coreDb } from '../../db/client.ts';
import { coreSkillCategory } from '../../db/schema/skills.ts';
import { emit, withEmit } from '../../events/index.ts';
import type { SessionScope } from '../../session/scope.ts';
import { CoreSkillError, requireSkillPermission } from './error.ts';
import {
  CORE_SKILL_CATEGORY_ARCHIVED,
  CORE_SKILL_CATEGORY_CREATED,
  CORE_SKILL_CATEGORY_UPDATED,
} from './events.ts';

export type SkillCategoryRow = typeof coreSkillCategory.$inferSelect;

export async function createSkillCategory(input: {
  input: { name: string; sort_order?: number };
  session: SessionScope;
}): Promise<{ id: string }> {
  const { session } = input;
  requireSkillPermission(session, 'core.skill.manage');
  if (!input.input.name.trim()) throw new CoreSkillError('VALIDATION', 'name required');
  let result!: { id: string };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [row] = await tx
        .insert(coreSkillCategory)
        .values({
          tenant_id: session.tenant_id,
          name: input.input.name.trim(),
          sort_order: input.input.sort_order ?? 0,
        })
        .returning({ id: coreSkillCategory.id });
      if (!row) throw new CoreSkillError('VALIDATION', 'category insert returned no row');
      result = { id: row.id };
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'core.skill_category',
        aggregateId: row.id,
        eventType: CORE_SKILL_CATEGORY_CREATED,
        eventVersion: 1,
        payload: { category_id: row.id, tenant_id: session.tenant_id },
      });
    },
  );
  return result;
}

export async function editSkillCategory(input: {
  id: string;
  expected_version?: number;
  input: { name?: string; sort_order?: number };
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, id } = input;
  requireSkillPermission(session, 'core.skill.manage');
  const [cur] = await coreDb()
    .select({ version: coreSkillCategory.version })
    .from(coreSkillCategory)
    .where(and(eq(coreSkillCategory.id, id), eq(coreSkillCategory.tenant_id, session.tenant_id)))
    .limit(1);
  if (!cur) throw new CoreSkillError('NOT_FOUND', 'category not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new CoreSkillError('CONFLICT', 'version mismatch');
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(coreSkillCategory)
        .set({
          ...(input.input.name !== undefined ? { name: input.input.name.trim() } : {}),
          ...(input.input.sort_order !== undefined ? { sort_order: input.input.sort_order } : {}),
          version: next,
          updated_at: new Date(),
        })
        .where(and(eq(coreSkillCategory.id, id), eq(coreSkillCategory.version, cur.version)))
        .returning({ id: coreSkillCategory.id });
      if (updated.length === 0)
        throw new CoreSkillError('CONFLICT', 'category modified concurrently');
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'core.skill_category',
        aggregateId: id,
        eventType: CORE_SKILL_CATEGORY_UPDATED,
        eventVersion: 1,
        payload: { category_id: id, tenant_id: session.tenant_id },
      });
    },
  );
  return { version: next };
}

export async function archiveSkillCategory(input: {
  id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, id } = input;
  requireSkillPermission(session, 'core.skill.manage');
  const [cur] = await coreDb()
    .select({ version: coreSkillCategory.version })
    .from(coreSkillCategory)
    .where(and(eq(coreSkillCategory.id, id), eq(coreSkillCategory.tenant_id, session.tenant_id)))
    .limit(1);
  if (!cur) throw new CoreSkillError('NOT_FOUND', 'category not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new CoreSkillError('CONFLICT', 'version mismatch');
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(coreSkillCategory)
        .set({ active: false, version: next, updated_at: new Date() })
        .where(and(eq(coreSkillCategory.id, id), eq(coreSkillCategory.version, cur.version)))
        .returning({ id: coreSkillCategory.id });
      if (updated.length === 0)
        throw new CoreSkillError('CONFLICT', 'category modified concurrently');
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'core.skill_category',
        aggregateId: id,
        eventType: CORE_SKILL_CATEGORY_ARCHIVED,
        eventVersion: 1,
        payload: { category_id: id, tenant_id: session.tenant_id },
      });
    },
  );
  return { version: next };
}

export async function listSkillCategories(
  session: SessionScope,
  opts?: { activeOnly?: boolean },
): Promise<SkillCategoryRow[]> {
  requireSkillPermission(session, 'core.skill.read');
  const where = opts?.activeOnly
    ? and(eq(coreSkillCategory.tenant_id, session.tenant_id), eq(coreSkillCategory.active, true))
    : eq(coreSkillCategory.tenant_id, session.tenant_id);
  return coreDb()
    .select()
    .from(coreSkillCategory)
    .where(where)
    .orderBy(asc(coreSkillCategory.sort_order), asc(coreSkillCategory.name));
}

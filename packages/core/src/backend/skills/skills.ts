import { and, asc, eq } from 'drizzle-orm';
import { coreDb } from '../../db/client.ts';
import { coreSkill, coreSkillCategory } from '../../db/schema/skills.ts';
import { emit, withEmit } from '../../events/index.ts';
import type { SessionScope } from '../../session/scope.ts';
import { CoreSkillError, requireSkillPermission } from './error.ts';
import { CORE_SKILL_ARCHIVED, CORE_SKILL_CREATED, CORE_SKILL_UPDATED } from './events.ts';

export type SkillRow = typeof coreSkill.$inferSelect;

async function categoryOrThrow(session: SessionScope, categoryId: string): Promise<void> {
  const [cat] = await coreDb()
    .select({ id: coreSkillCategory.id })
    .from(coreSkillCategory)
    .where(
      and(eq(coreSkillCategory.id, categoryId), eq(coreSkillCategory.tenant_id, session.tenant_id)),
    )
    .limit(1);
  if (!cat) throw new CoreSkillError('VALIDATION', 'category not found');
}

export async function createSkill(input: {
  input: { category_id: string; name: string };
  session: SessionScope;
}): Promise<{ id: string }> {
  const { session } = input;
  requireSkillPermission(session, 'core.skill.manage');
  if (!input.input.name.trim()) throw new CoreSkillError('VALIDATION', 'name required');
  await categoryOrThrow(session, input.input.category_id);
  let result!: { id: string };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [row] = await tx
        .insert(coreSkill)
        .values({
          tenant_id: session.tenant_id,
          category_id: input.input.category_id,
          name: input.input.name.trim(),
        })
        .returning({ id: coreSkill.id });
      if (!row) throw new CoreSkillError('VALIDATION', 'skill insert returned no row');
      result = { id: row.id };
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'core.skill',
        aggregateId: row.id,
        eventType: CORE_SKILL_CREATED,
        eventVersion: 1,
        payload: {
          skill_id: row.id,
          category_id: input.input.category_id,
          tenant_id: session.tenant_id,
        },
      });
    },
  );
  return result;
}

export async function editSkill(input: {
  id: string;
  expected_version?: number;
  input: { category_id?: string; name?: string };
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, id } = input;
  requireSkillPermission(session, 'core.skill.manage');
  const [cur] = await coreDb()
    .select({ version: coreSkill.version, category_id: coreSkill.category_id })
    .from(coreSkill)
    .where(and(eq(coreSkill.id, id), eq(coreSkill.tenant_id, session.tenant_id)))
    .limit(1);
  if (!cur) throw new CoreSkillError('NOT_FOUND', 'skill not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new CoreSkillError('CONFLICT', 'version mismatch');
  if (input.input.category_id) await categoryOrThrow(session, input.input.category_id);
  const next = cur.version + 1;
  const categoryId = input.input.category_id ?? cur.category_id;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(coreSkill)
        .set({
          ...(input.input.name !== undefined ? { name: input.input.name.trim() } : {}),
          ...(input.input.category_id !== undefined
            ? { category_id: input.input.category_id }
            : {}),
          version: next,
          updated_at: new Date(),
        })
        .where(and(eq(coreSkill.id, id), eq(coreSkill.version, cur.version)))
        .returning({ id: coreSkill.id });
      if (updated.length === 0) throw new CoreSkillError('CONFLICT', 'skill modified concurrently');
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'core.skill',
        aggregateId: id,
        eventType: CORE_SKILL_UPDATED,
        eventVersion: 1,
        payload: { skill_id: id, category_id: categoryId, tenant_id: session.tenant_id },
      });
    },
  );
  return { version: next };
}

export async function archiveSkill(input: {
  id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, id } = input;
  requireSkillPermission(session, 'core.skill.manage');
  const [cur] = await coreDb()
    .select({ version: coreSkill.version, category_id: coreSkill.category_id })
    .from(coreSkill)
    .where(and(eq(coreSkill.id, id), eq(coreSkill.tenant_id, session.tenant_id)))
    .limit(1);
  if (!cur) throw new CoreSkillError('NOT_FOUND', 'skill not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new CoreSkillError('CONFLICT', 'version mismatch');
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(coreSkill)
        .set({ active: false, version: next, updated_at: new Date() })
        .where(and(eq(coreSkill.id, id), eq(coreSkill.version, cur.version)))
        .returning({ id: coreSkill.id });
      if (updated.length === 0) throw new CoreSkillError('CONFLICT', 'skill modified concurrently');
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'core.skill',
        aggregateId: id,
        eventType: CORE_SKILL_ARCHIVED,
        eventVersion: 1,
        payload: { skill_id: id, category_id: cur.category_id, tenant_id: session.tenant_id },
      });
    },
  );
  return { version: next };
}

export async function listSkills(
  session: SessionScope,
  opts?: { activeOnly?: boolean; categoryId?: string },
): Promise<SkillRow[]> {
  requireSkillPermission(session, 'core.skill.read');
  const filters = [eq(coreSkill.tenant_id, session.tenant_id)];
  if (opts?.activeOnly) filters.push(eq(coreSkill.active, true));
  if (opts?.categoryId) filters.push(eq(coreSkill.category_id, opts.categoryId));
  return coreDb()
    .select()
    .from(coreSkill)
    .where(and(...filters))
    .orderBy(asc(coreSkill.name));
}

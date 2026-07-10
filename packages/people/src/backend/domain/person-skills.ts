import type { SessionScope } from '@seta/core';
import { listSkills } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { personSkill, userProjection } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { resolveSelfPersonId } from './self.ts';

// Ungated skill-name read (callers gate). Joins person_skill → user_projection on the
// user↔person link so a user_id resolves to their catalog skill names.
export async function fetchPersonSkillNames(tenantId: string, userId: string): Promise<string[]> {
  const rows = await peopleDb()
    .select({ skill_name: personSkill.skill_name })
    .from(personSkill)
    .innerJoin(userProjection, eq(userProjection.person_id, personSkill.person_id))
    .where(and(eq(personSkill.tenant_id, tenantId), eq(userProjection.user_id, userId)))
    .orderBy(personSkill.skill_name);
  return rows.map((r) => r.skill_name);
}

export interface PersonSkill {
  id: string;
  name: string;
  level: number | null;
}

// Ungated skill read with id + proficiency level (callers gate), for the caller's
// own profile page. Ordered by name for a stable, non-jumping list.
export async function fetchPersonSkills(tenantId: string, userId: string): Promise<PersonSkill[]> {
  return peopleDb()
    .select({ id: personSkill.skill_id, name: personSkill.skill_name, level: personSkill.level })
    .from(personSkill)
    .innerJoin(userProjection, eq(userProjection.person_id, personSkill.person_id))
    .where(and(eq(personSkill.tenant_id, tenantId), eq(userProjection.user_id, userId)))
    .orderBy(personSkill.skill_name);
}

// Public read used by self-service profile + cross-module callers (planner/staffing).
export async function getPersonSkills(
  session: SessionScope,
  input: { user_id: string },
): Promise<string[]> {
  requirePermission(session, 'people.worker.read');
  return fetchPersonSkillNames(session.tenant_id, input.user_id);
}

// Self-service whole-list set: resolves names against the tenant skill catalog,
// then diffs the caller's current person_skill rows (add missing, remove dropped).
export async function setMySkills(
  session: SessionScope,
  input: { skills: ReadonlyArray<string> },
): Promise<void> {
  requirePermission(session, 'people.self.manage');
  const personId = await resolveSelfPersonId(session);

  const catalog = await listSkills(session);
  const byName = new Map(catalog.map((s) => [s.name.toLowerCase().trim(), s]));

  const desired = new Map<string, string>(); // skill_id -> skill_name
  const unknown: string[] = [];
  for (const raw of input.skills) {
    const key = raw.toLowerCase().trim();
    if (key.length === 0) continue;
    const hit = byName.get(key);
    if (!hit) {
      unknown.push(raw.trim());
      continue;
    }
    desired.set(hit.id, hit.name);
  }
  if (unknown.length > 0) {
    throw new PeopleError('VALIDATION', `skills not in catalog: ${unknown.join(', ')}`, {
      unknown,
    });
  }

  const current = await peopleDb()
    .select({ skill_id: personSkill.skill_id })
    .from(personSkill)
    .where(and(tenantScoped(personSkill.tenant_id, session), eq(personSkill.person_id, personId)));
  const currentIds = new Set(current.map((r) => r.skill_id));

  const toAdd = [...desired.keys()].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !desired.has(id));
  if (toAdd.length === 0 && toRemove.length === 0) return;

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      if (toRemove.length > 0) {
        await tx
          .delete(personSkill)
          .where(
            and(
              eq(personSkill.tenant_id, session.tenant_id),
              eq(personSkill.person_id, personId),
              inArray(personSkill.skill_id, toRemove),
            ),
          );
      }
      if (toAdd.length > 0) {
        await tx
          .insert(personSkill)
          .values(
            toAdd.map((skillId) => ({
              tenant_id: session.tenant_id,
              person_id: personId,
              skill_id: skillId,
              skill_name: desired.get(skillId) as string,
            })),
          )
          .onConflictDoNothing();
      }
      for (const skillId of toRemove) {
        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'people.person',
          aggregateId: personId,
          eventType: 'people.person.skill.removed',
          eventVersion: 1,
          payload: { person_id: personId, skill_id: skillId, tenant_id: session.tenant_id },
        });
      }
      for (const skillId of toAdd) {
        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'people.person',
          aggregateId: personId,
          eventType: 'people.person.skill.added',
          eventVersion: 1,
          payload: { person_id: personId, skill_id: skillId, tenant_id: session.tenant_id },
        });
      }
    },
  );
}

export async function addPersonSkill(input: {
  person_id: string;
  skill_id: string;
  level?: number;
  session: SessionScope;
}): Promise<void> {
  const { person_id, skill_id, level, session } = input;
  requirePermission(session, 'people.worker.update');

  const skills = await listSkills(session);
  const skill = skills.find((s) => s.id === skill_id);
  if (!skill) throw new PeopleError('VALIDATION', `skill not found in catalog: ${skill_id}`);

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      await tx
        .insert(personSkill)
        .values({
          tenant_id: session.tenant_id,
          person_id,
          skill_id,
          skill_name: skill.name,
          level: level ?? null,
        })
        .onConflictDoNothing();
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.person',
        aggregateId: person_id,
        eventType: 'people.person.skill.added',
        eventVersion: 1,
        payload: { person_id, skill_id, tenant_id: session.tenant_id },
      });
    },
  );
}

// Guarded UPDATE of a person_skill's proficiency level. Separate from addPersonSkill
// because that path is onConflictDoNothing and can't mutate an existing row.
// level null = "not rated". Shared by the manager (setPersonSkillLevel) and
// self-service (setMySkillLevel) paths; each gates the permission before calling.
async function applySkillLevel(
  session: SessionScope,
  person_id: string,
  skill_id: string,
  level: number | null,
): Promise<void> {
  if (level !== null && (!Number.isInteger(level) || level < 1 || level > 5)) {
    throw new PeopleError('VALIDATION', `level must be an integer 1-5 or null: ${level}`);
  }

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(personSkill)
        .set({ level, version: sql`${personSkill.version} + 1`, updated_at: new Date() })
        .where(
          and(
            eq(personSkill.tenant_id, session.tenant_id),
            eq(personSkill.person_id, person_id),
            eq(personSkill.skill_id, skill_id),
          ),
        )
        .returning({ id: personSkill.id });
      if (updated.length === 0) {
        throw new PeopleError('NOT_FOUND', `skill not assigned to worker: ${skill_id}`);
      }
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.person',
        aggregateId: person_id,
        eventType: 'people.person.skill.level.set',
        eventVersion: 1,
        payload: { person_id, skill_id, level, tenant_id: session.tenant_id },
      });
    },
  );
}

// Manager path: rate any worker's skill (gated on people.worker.update).
export async function setPersonSkillLevel(input: {
  person_id: string;
  skill_id: string;
  level: number | null;
  session: SessionScope;
}): Promise<void> {
  const { person_id, skill_id, level, session } = input;
  requirePermission(session, 'people.worker.update');
  await applySkillLevel(session, person_id, skill_id, level);
}

// Self-service path: rate one of my own skills (gated on people.self.manage).
export async function setMySkillLevel(
  session: SessionScope,
  input: { skill_id: string; level: number | null },
): Promise<void> {
  requirePermission(session, 'people.self.manage');
  const personId = await resolveSelfPersonId(session);
  await applySkillLevel(session, personId, input.skill_id, input.level);
}

export async function removePersonSkill(input: {
  person_id: string;
  skill_id: string;
  session: SessionScope;
}): Promise<void> {
  const { person_id, skill_id, session } = input;
  requirePermission(session, 'people.worker.update');

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      await tx
        .delete(personSkill)
        .where(
          and(
            eq(personSkill.tenant_id, session.tenant_id),
            eq(personSkill.person_id, person_id),
            eq(personSkill.skill_id, skill_id),
          ),
        );
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.person',
        aggregateId: person_id,
        eventType: 'people.person.skill.removed',
        eventVersion: 1,
        payload: { person_id, skill_id, tenant_id: session.tenant_id },
      });
    },
  );
}

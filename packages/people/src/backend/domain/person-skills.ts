import type { SessionScope } from '@seta/core';
import { listSkills } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq, inArray } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, personSkill } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { resolveSelfPersonId } from './self.ts';

// Ungated skill-name read (callers gate). Joins person_skill → person on the
// user↔person link so a user_id resolves to their catalog skill names.
export async function fetchPersonSkillNames(tenantId: string, userId: string): Promise<string[]> {
  const rows = await peopleDb()
    .select({ skill_name: personSkill.skill_name })
    .from(personSkill)
    .innerJoin(person, eq(person.id, personSkill.person_id))
    .where(and(eq(personSkill.tenant_id, tenantId), eq(person.user_id, userId)))
    .orderBy(personSkill.skill_name);
  return rows.map((r) => r.skill_name);
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
  requirePermission(session, 'people.worker.edit');

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

export async function removePersonSkill(input: {
  person_id: string;
  skill_id: string;
  session: SessionScope;
}): Promise<void> {
  const { person_id, skill_id, session } = input;
  requirePermission(session, 'people.worker.edit');

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

import type { SessionScope } from '@seta/core';
import { listSkills } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { personSkill } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

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

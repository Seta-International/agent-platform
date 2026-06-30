import { createDb } from '@seta/shared-db';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type { Pool } from 'pg';
import * as schema from '../db/schema.ts';

export interface PersonBackfillRow {
  person_id: string;
  skills: string[];
  bio: string | null;
}

export interface ListPersonsForBackfillInput {
  tenant_id: string;
  cursor: string;
  limit: number;
  pool: Pool;
}

export async function listPersonsForBackfill(
  input: ListPersonsForBackfillInput,
): Promise<PersonBackfillRow[]> {
  const { tenant_id, cursor, limit, pool } = input;
  const db = createDb(pool, schema, { schemaFilter: ['people'] });

  const persons = await db
    .select({ id: schema.person.id, bio: schema.person.bio })
    .from(schema.person)
    .where(and(eq(schema.person.tenant_id, tenant_id), gt(schema.person.id, cursor)))
    .orderBy(asc(schema.person.id))
    .limit(limit);

  if (persons.length === 0) return [];

  const personIds = persons.map((p) => p.id);

  const skillRows = await db
    .select({ person_id: schema.personSkill.person_id, skill_name: schema.personSkill.skill_name })
    .from(schema.personSkill)
    .where(
      and(
        eq(schema.personSkill.tenant_id, tenant_id),
        inArray(schema.personSkill.person_id, personIds),
      ),
    );

  const skillsByPerson = new Map<string, string[]>();
  for (const row of skillRows) {
    const list = skillsByPerson.get(row.person_id) ?? [];
    list.push(row.skill_name);
    skillsByPerson.set(row.person_id, list);
  }

  return persons.map((p) => ({
    person_id: p.id,
    bio: p.bio,
    skills: skillsByPerson.get(p.id) ?? [],
  }));
}

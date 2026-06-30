import { and, eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, personSkill } from '../db/schema.ts';

export interface PersonProfileForEmbedding {
  skills: string[];
  bio?: string;
}

export async function getPersonProfileForEmbedding(input: {
  tenant_id: string;
  person_id: string;
}): Promise<PersonProfileForEmbedding | null> {
  const { tenant_id, person_id } = input;

  const [p] = await peopleDb()
    .select({ bio: person.bio })
    .from(person)
    .where(and(eq(person.id, person_id), eq(person.tenant_id, tenant_id)))
    .limit(1);

  if (!p) return null;

  const skillRows = await peopleDb()
    .select({ skill_name: personSkill.skill_name })
    .from(personSkill)
    .where(and(eq(personSkill.person_id, person_id), eq(personSkill.tenant_id, tenant_id)));

  return {
    bio: p.bio ?? undefined,
    skills: skillRows.map((r) => r.skill_name),
  };
}

import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, userProjection } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { fetchPersonSkills, type PersonSkill } from './person-skills.ts';
import { fetchPresenceByUserId, type PresenceResult } from './read-presence.ts';

export interface MyProfile extends PresenceResult {
  skills: PersonSkill[];
  bio: string | null;
  full_name: string | null;
}

// Self-service composite read for the caller's own profile page: presence +
// catalog skills (with proficiency level) + bio + display name, all keyed off
// session.user_id.
export async function readMyProfile(session: SessionScope): Promise<MyProfile> {
  requirePermission(session, 'people.self.read');

  const presence = await fetchPresenceByUserId(session.tenant_id, session.user_id);
  const skills = await fetchPersonSkills(session.tenant_id, session.user_id);

  const [row] = await peopleDb()
    .select({ bio: person.bio, full_name: person.full_name })
    .from(person)
    .innerJoin(userProjection, eq(userProjection.person_id, person.id))
    .where(
      and(tenantScoped(person.tenant_id, session), eq(userProjection.user_id, session.user_id)),
    )
    .limit(1);

  return {
    ...presence,
    skills,
    bio: row?.bio ?? null,
    full_name: row?.full_name ?? null,
  };
}

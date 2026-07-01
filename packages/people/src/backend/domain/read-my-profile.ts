import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, worker } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { requirePermission } from '../rbac.ts';
import { fetchPersonSkillNames } from './person-skills.ts';
import { fetchPresenceByUserId, type PresenceResult } from './read-presence.ts';

export interface MyProfile extends PresenceResult {
  skills: string[];
  bio: string | null;
  full_name: string | null;
}

// Self-service composite read for the caller's own profile page: presence +
// catalog skills + bio + display name, all keyed off session.user_id.
export async function readMyProfile(session: SessionScope): Promise<MyProfile> {
  requirePermission(session, 'people.self.read');

  const presence = await fetchPresenceByUserId(session.tenant_id, session.user_id);
  const skills = await fetchPersonSkillNames(session.tenant_id, session.user_id);

  const [row] = await peopleDb()
    .select({ bio: person.bio, full_name: worker.full_name })
    .from(person)
    .leftJoin(worker, eq(worker.person_id, person.id))
    .where(and(tenantScoped(person.tenant_id, session), eq(person.user_id, session.user_id)))
    .limit(1);

  return {
    ...presence,
    skills,
    bio: row?.bio ?? null,
    full_name: row?.full_name ?? null,
  };
}

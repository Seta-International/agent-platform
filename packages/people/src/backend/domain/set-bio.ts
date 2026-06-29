import type { SessionScope } from '@seta/core';
import { eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { resolveSelfPersonId } from './self.ts';

// Self-service bio write to person.bio. Blank trims to null (no empty strings).
export async function setBio(session: SessionScope, input: { bio: string | null }): Promise<void> {
  requirePermission(session, 'people.worker.read');
  const personId = await resolveSelfPersonId(session);

  const trimmed = input.bio?.trim();
  const next = trimmed && trimmed.length > 0 ? trimmed : null;

  await peopleDb()
    .update(person)
    .set({ bio: next, updated_at: new Date() })
    .where(eq(person.id, personId));
}

import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq, sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { directoryPerson, user } from '../db/schema.ts';
import { deactivateUser } from '../domain/deactivate-user.ts';
import { reactivateUser } from '../domain/reactivate-user.ts';
import { IdentityError } from '../rbac.ts';

interface WorkerLifecyclePayload {
  person_id: string;
  tenant_id: string;
}

const systemActor = { type: 'system' as const, user_id: null };

async function resolveUserId(payload: WorkerLifecyclePayload): Promise<string | null> {
  const [row] = await identityDb()
    .select({ id: user.id })
    .from(directoryPerson)
    .innerJoin(
      user,
      and(
        eq(user.tenant_id, directoryPerson.tenant_id),
        sql`lower(${user.email}) = lower(${directoryPerson.work_email})`,
      ),
    )
    .where(eq(directoryPerson.person_id, payload.person_id))
    .limit(1);
  return row?.id ?? null;
}

export const autoSuspendSubscribers: SubscriberDef[] = [
  {
    subscription: 'identity.account.auto-suspend',
    event: 'people.worker.terminated',
    eventVersion: 1,
    handler: async (e: DomainEvent<WorkerLifecyclePayload>) => {
      const userId = await resolveUserId(e.payload);
      if (!userId) return;
      try {
        await deactivateUser(userId, systemActor);
      } catch (err) {
        if (err instanceof IdentityError && err.code === 'LAST_ORG_ADMIN') {
          // Last active admin — skip so the bus does not retry forever.
          console.warn({ userId }, 'auto-suspend skipped: last active admin');
          return;
        }
        throw err;
      }
    },
  },
  {
    subscription: 'identity.account.auto-reinstate',
    event: 'people.worker.reinstated',
    eventVersion: 1,
    handler: async (e: DomainEvent<WorkerLifecyclePayload>) => {
      const userId = await resolveUserId(e.payload);
      if (userId) await reactivateUser(userId, systemActor);
    },
  },
];

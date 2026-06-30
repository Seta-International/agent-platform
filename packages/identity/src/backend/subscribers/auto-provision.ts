import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { provisionLogin } from '../domain/provision-login.ts';

interface WorkerPayload {
  person_id: string;
  tenant_id: string;
  full_name: string;
  work_email: string | null;
  job_title: string | null;
}

async function maybeProvision(p: WorkerPayload): Promise<void> {
  if (!p.work_email) return;
  await provisionLogin(
    { tenant_id: p.tenant_id, email: p.work_email, name: p.full_name },
    { type: 'system', user_id: null },
  );
}

export const autoProvisionSubscribers: SubscriberDef[] = [
  {
    subscription: 'identity.account.auto-provision.created',
    event: 'people.worker.created',
    eventVersion: 1,
    handler: async (event, _ctx) => maybeProvision((event as DomainEvent<WorkerPayload>).payload),
  },
  {
    subscription: 'identity.account.auto-provision.updated',
    event: 'people.worker.updated',
    eventVersion: 1,
    handler: async (event, _ctx) => maybeProvision((event as DomainEvent<WorkerPayload>).payload),
  },
];

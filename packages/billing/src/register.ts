import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import type { SubscriberDef } from '@seta/shared-types';
import * as schema from './backend/db/schema/index.ts';
import { usageRecorderSubscriber } from './backend/subscribers/usage-recorder.ts';
import { BILLING_EVENTS } from './events.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerBillingContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'billing',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: BILLING_EVENTS,
    subscribers: [usageRecorderSubscriber() as SubscriberDef],
  });
}

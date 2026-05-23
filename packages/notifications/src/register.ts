import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import type { SubscriberDef } from '@seta/shared-types';
import * as schema from './backend/db/schema/index.ts';
import { notifierSubscriber } from './backend/subscribers/notifier.ts';
import { NOTIFICATIONS_EVENTS } from './events.ts';
import { NOTIFICATIONS_PERMISSIONS } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerNotificationsContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'notifications',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: NOTIFICATIONS_EVENTS,
    rbac: NOTIFICATIONS_PERMISSIONS,
    subscribers: [notifierSubscriber() as SubscriberDef],
  });
}

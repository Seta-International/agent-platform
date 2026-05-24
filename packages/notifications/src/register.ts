import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, StreamHubBuilder } from '@seta/core';
import type { SubscriberDef } from '@seta/shared-types';
import * as schema from './backend/db/schema/index.ts';
import { NotificationStreamHub } from './backend/stream/hub.ts';
import { notifierSubscriber } from './backend/subscribers/notifier.ts';
import { NOTIFICATIONS_EVENTS } from './events.ts';
import { NOTIFICATIONS_PERMISSIONS } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const NOTIFICATIONS_RBAC: Record<string, string> = Object.fromEntries(
  NOTIFICATIONS_PERMISSIONS.map((p) => [p, p]),
);

const buildNotificationStreamHub: StreamHubBuilder = (deps) => {
  const hub = new NotificationStreamHub();
  return {
    start: async () => {
      await hub.start(deps.pool);
    },
    stop: async () => {
      await hub.stop();
    },
    hub,
  };
};

export function registerNotificationsContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'notifications',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: NOTIFICATIONS_EVENTS,
    rbac: NOTIFICATIONS_RBAC,
    subscribers: [notifierSubscriber() as SubscriberDef],
    stream: buildNotificationStreamHub,
  });
}

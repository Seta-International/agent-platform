import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_CHANNELS,
  notificationPrefs,
} from '../../src/backend/db/schema/notification-prefs.ts';
import { notificationsTable } from '../../src/backend/db/schema/notifications.ts';

describe('notifications schema constitution', () => {
  it('dedupe unique is tenant-led (tenant_id, source_event_id, user_id)', () => {
    const cfg = getTableConfig(notificationsTable);
    const uq = cfg.uniqueConstraints.find(
      (u) => u.name === 'notifications_tenant_source_user_unique',
    );
    expect(uq?.columns.map((c) => c.name)).toEqual(['tenant_id', 'source_event_id', 'user_id']);
  });

  it('notifications.event_type stays plain text, not enum-checked', () => {
    const cfg = getTableConfig(notificationsTable);
    expect(cfg.columns.find((c) => c.name === 'event_type')?.enumValues).toBeUndefined();
    expect(cfg.checks.some((c) => c.name.includes('event_type'))).toBe(false);
  });

  it('notification_prefs.channel is a textEnum backed by a CHECK over the exact value set', () => {
    const cfg = getTableConfig(notificationPrefs);
    expect(NOTIFICATION_CHANNELS).toEqual(['in_app', 'email']);
    expect(cfg.columns.find((c) => c.name === 'channel')?.enumValues).toEqual(
      NOTIFICATION_CHANNELS,
    );
    expect(cfg.checks.some((c) => c.name === 'notification_prefs_channel_check')).toBe(true);
  });

  it('notification_prefs.event_type stays plain text, not enum-checked', () => {
    const cfg = getTableConfig(notificationPrefs);
    expect(cfg.columns.find((c) => c.name === 'event_type')?.enumValues).toBeUndefined();
    expect(cfg.checks.some((c) => c.name.includes('event_type'))).toBe(false);
  });
});

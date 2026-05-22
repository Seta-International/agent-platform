import { describe, expect, it } from 'vitest';
import { notificationKeys } from './query-keys';

describe('notificationKeys', () => {
  it('all is a stable tuple', () => {
    expect(notificationKeys.all).toEqual(['notifications']);
  });
  it('list with no params is distinct from list with unread=true', () => {
    expect(notificationKeys.list({})).not.toEqual(notificationKeys.list({ unread: true }));
  });
  it('unreadCount is nested under all', () => {
    expect(notificationKeys.unreadCount()[0]).toBe('notifications');
  });
});

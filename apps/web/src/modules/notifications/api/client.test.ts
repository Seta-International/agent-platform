import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsClient } from './client';

const originalFetch = global.fetch;

describe('notificationsClient', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/unread-count')) {
        return new Response(JSON.stringify({ count: 4 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/notifications/v1?')) {
        return new Response(
          JSON.stringify({
            items: [{ id: '1', event_type: 't', payload: {}, created_at: 'x', read_at: null }],
            next_cursor: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/read-all')) {
        return new Response(JSON.stringify({ updated: 3 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('list passes unread + cursor + limit', async () => {
    const page = await notificationsClient.list({ unread: true, limit: 10, cursor: 'abc' });
    expect(page.items).toHaveLength(1);
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('unread=true');
    expect(calledUrl).toContain('cursor=abc');
    expect(calledUrl).toContain('limit=10');
  });

  it('unreadCount returns count', async () => {
    expect(await notificationsClient.unreadCount()).toEqual({ count: 4 });
  });

  it('markAllRead returns updated', async () => {
    expect(await notificationsClient.markAllRead()).toEqual({ updated: 3 });
  });

  it('throws NotificationsClientError on non-2xx', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 }),
    );
    await expect(notificationsClient.markRead('x')).rejects.toMatchObject({
      name: 'NotificationsClientError',
      status: 404,
    });
  });
});

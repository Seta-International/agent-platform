import { describe, expect, it } from 'vitest';
import { NotificationStreamHub } from '../../src/notifications-stream/hub.ts';

describe('NotificationStreamHub', () => {
  it('routes a userId payload to that user only', () => {
    const hub = new NotificationStreamHub();
    const aReceived: string[] = [];
    const bReceived: string[] = [];

    hub.register({
      id: 'conn-a',
      userId: 'user-1',
      send: () => aReceived.push('hit'),
      close: () => {},
    });
    hub.register({
      id: 'conn-b',
      userId: 'user-2',
      send: () => bReceived.push('hit'),
      close: () => {},
    });

    hub.fanOut('user-1');
    expect(aReceived).toEqual(['hit']);
    expect(bReceived).toEqual([]);
  });

  it('supports multiple connections per user (multi-tab)', () => {
    const hub = new NotificationStreamHub();
    const tab1: string[] = [];
    const tab2: string[] = [];
    hub.register({ id: '1', userId: 'u', send: () => tab1.push('x'), close: () => {} });
    hub.register({ id: '2', userId: 'u', send: () => tab2.push('x'), close: () => {} });
    hub.fanOut('u');
    expect(tab1).toEqual(['x']);
    expect(tab2).toEqual(['x']);
  });

  it('unregister removes only that connection', () => {
    const hub = new NotificationStreamHub();
    const got: string[] = [];
    hub.register({ id: '1', userId: 'u', send: () => got.push('1'), close: () => {} });
    hub.register({ id: '2', userId: 'u', send: () => got.push('2'), close: () => {} });
    hub.unregister('1');
    hub.fanOut('u');
    expect(got).toEqual(['2']);
  });
});

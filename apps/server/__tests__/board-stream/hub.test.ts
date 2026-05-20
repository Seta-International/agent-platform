import type { DomainEvent } from '@seta/shared-types';
import { describe, expect, it } from 'vitest';
import { BoardStreamHub } from '../../src/board-stream/hub.ts';

function makePlannerEvent(groupId: string, eventType = 'planner.task.created'): DomainEvent {
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId: '00000000-0000-0000-0000-000000000001',
    aggregateType: 'planner.task',
    aggregateId: crypto.randomUUID(),
    eventType,
    eventVersion: 1,
    payload: { group_id: groupId, title: 'Test task' },
  };
}

describe('BoardStreamHub', () => {
  it('delivers event to a connection whose filterGroupIds matches', () => {
    // Inject a no-op tap so the test is pure in-memory with no dispatcher dependency.
    const hub = new BoardStreamHub(() => () => {});
    hub.start();

    const received: { eventType: string; payload: unknown }[] = [];
    hub.register({
      id: 'conn-1',
      filterGroupIds: new Set(['g1']),
      send: (eventType, payload) => received.push({ eventType, payload }),
      close: () => {},
    });

    hub.fanOut(makePlannerEvent('g1'));

    expect(received).toHaveLength(1);
    expect(received[0]?.eventType).toBe('planner.task.created');
  });

  it('does not deliver event when group_id is not in filterGroupIds', () => {
    const hub = new BoardStreamHub(() => () => {});
    hub.start();

    const received: unknown[] = [];
    hub.register({
      id: 'conn-1',
      filterGroupIds: new Set(['g2']),
      send: (_et, payload) => received.push(payload),
      close: () => {},
    });

    hub.fanOut(makePlannerEvent('g1'));

    expect(received).toHaveLength(0);
  });

  it('only delivers to connections whose filterGroupIds include the event group_id', () => {
    const hub = new BoardStreamHub(() => () => {});
    hub.start();

    const recA: string[] = [];
    const recB: string[] = [];
    hub.register({
      id: 'conn-a',
      filterGroupIds: new Set(['g1']),
      send: (et) => recA.push(et),
      close: () => {},
    });
    hub.register({
      id: 'conn-b',
      filterGroupIds: new Set(['g2']),
      send: (et) => recB.push(et),
      close: () => {},
    });

    hub.fanOut(makePlannerEvent('g1'));

    expect(recA).toHaveLength(1);
    expect(recB).toHaveLength(0);
  });

  it('skips events with no group_id in payload', () => {
    const hub = new BoardStreamHub(() => () => {});
    hub.start();

    const received: unknown[] = [];
    hub.register({
      id: 'conn-1',
      filterGroupIds: new Set(['g1']),
      send: (_et, payload) => received.push(payload),
      close: () => {},
    });

    const evt: DomainEvent = {
      id: crypto.randomUUID(),
      occurredAt: new Date(),
      tenantId: '00000000-0000-0000-0000-000000000001',
      aggregateType: 'planner.task',
      aggregateId: crypto.randomUUID(),
      eventType: 'planner.task.created',
      eventVersion: 1,
      payload: { title: 'No group id here' },
    };
    hub.fanOut(evt);

    expect(received).toHaveLength(0);
  });

  it('unregisters a connection so it no longer receives events', () => {
    const hub = new BoardStreamHub(() => () => {});
    hub.start();

    const received: unknown[] = [];
    hub.register({
      id: 'conn-1',
      filterGroupIds: new Set(['g1']),
      send: (_et, payload) => received.push(payload),
      close: () => {},
    });

    hub.unregister('conn-1');
    hub.fanOut(makePlannerEvent('g1'));

    expect(received).toHaveLength(0);
  });

  it('stop() closes all connections and clears the registry', () => {
    const hub = new BoardStreamHub(() => () => {});
    hub.start();

    let closed = false;
    hub.register({
      id: 'conn-1',
      filterGroupIds: new Set(['g1']),
      send: () => {},
      close: () => {
        closed = true;
      },
    });

    expect(hub.connectionCount()).toBe(1);
    hub.stop();
    expect(closed).toBe(true);
    expect(hub.connectionCount()).toBe(0);
  });

  it('tap predicate only matches planner.* events when using real addEventTap', () => {
    let capturedPredicate: ((e: DomainEvent) => boolean) | null = null;
    const hub = new BoardStreamHub((predicate, _handler) => {
      capturedPredicate = predicate as (e: DomainEvent) => boolean;
      return () => {};
    });
    hub.start();

    const predicate = capturedPredicate as ((e: DomainEvent) => boolean) | null;
    expect(predicate).not.toBeNull();
    if (!predicate) throw new Error('tap predicate not captured');

    const plannerEvt = makePlannerEvent('g1');
    const otherEvt = { ...makePlannerEvent('g1'), eventType: 'identity.user.created' };

    expect(predicate(plannerEvt)).toBe(true);
    expect(predicate(otherEvt)).toBe(false);
  });
});

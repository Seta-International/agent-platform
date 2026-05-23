import type { DomainEvent } from '@seta/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeStreamHub } from './hub.ts';

function makeKnowledgeEvent(
  tenantId: string,
  fileId: string,
  eventType: 'knowledge.file.processed' | 'knowledge.file.failed',
  errorReason?: string,
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId,
    aggregateType: 'knowledge.file',
    aggregateId: fileId,
    eventType,
    eventVersion: 1,
    payload: { tenant_id: tenantId, file_id: fileId, error_reason: errorReason ?? null },
  };
}

describe('KnowledgeStreamHub', () => {
  it('fans out processed events to subscribers of the same tenant', () => {
    let registered: ((e: DomainEvent) => void) | undefined;
    const addTap = vi.fn((_p, h) => {
      registered = h;
      return () => {};
    });
    // biome-ignore lint/suspicious/noExplicitAny: vi.fn mock cast to internal subscribe shape
    const hub = new KnowledgeStreamHub(addTap as any);
    hub.start();

    const send = vi.fn();
    hub.register({ id: 'c1', tenant_id: 't1', send, close: () => {} });

    registered!(makeKnowledgeEvent('t1', 'f1', 'knowledge.file.processed'));

    expect(send).toHaveBeenCalledWith({ file_id: 'f1', status: 'ready', error_reason: null });
  });

  it('does not fan out across tenants', () => {
    let registered: ((e: DomainEvent) => void) | undefined;
    const addTap = vi.fn((_p, h) => {
      registered = h;
      return () => {};
    });
    // biome-ignore lint/suspicious/noExplicitAny: vi.fn mock cast to internal subscribe shape
    const hub = new KnowledgeStreamHub(addTap as any);
    hub.start();

    const sendT1 = vi.fn();
    const sendT2 = vi.fn();
    hub.register({ id: 'c1', tenant_id: 't1', send: sendT1, close: () => {} });
    hub.register({ id: 'c2', tenant_id: 't2', send: sendT2, close: () => {} });

    registered!(makeKnowledgeEvent('t1', 'f1', 'knowledge.file.processed'));

    expect(sendT1).toHaveBeenCalledOnce();
    expect(sendT2).not.toHaveBeenCalled();
  });

  it('emits status=failed with error_reason for failed events', () => {
    let registered: ((e: DomainEvent) => void) | undefined;
    const addTap = vi.fn((_p, h) => {
      registered = h;
      return () => {};
    });
    // biome-ignore lint/suspicious/noExplicitAny: vi.fn mock cast to internal subscribe shape
    const hub = new KnowledgeStreamHub(addTap as any);
    hub.start();

    const send = vi.fn();
    hub.register({ id: 'c1', tenant_id: 't1', send, close: () => {} });

    registered!(makeKnowledgeEvent('t1', 'f2', 'knowledge.file.failed', 'parse error'));

    expect(send).toHaveBeenCalledWith({
      file_id: 'f2',
      status: 'failed',
      error_reason: 'parse error',
    });
  });

  it('skips events missing tenant_id or file_id in payload', () => {
    let registered: ((e: DomainEvent) => void) | undefined;
    const addTap = vi.fn((_p, h) => {
      registered = h;
      return () => {};
    });
    // biome-ignore lint/suspicious/noExplicitAny: vi.fn mock cast to internal subscribe shape
    const hub = new KnowledgeStreamHub(addTap as any);
    hub.start();

    const send = vi.fn();
    hub.register({ id: 'c1', tenant_id: 't1', send, close: () => {} });

    const badEvt: DomainEvent = {
      id: crypto.randomUUID(),
      occurredAt: new Date(),
      tenantId: 't1',
      aggregateType: 'knowledge.file',
      aggregateId: 'f1',
      eventType: 'knowledge.file.processed',
      eventVersion: 1,
      payload: {},
    };
    registered!(badEvt);

    expect(send).not.toHaveBeenCalled();
  });

  it('stop() closes all connections and clears the registry', () => {
    const hub = new KnowledgeStreamHub(() => () => {});
    hub.start();

    let closed = false;
    hub.register({
      id: 'c1',
      tenant_id: 't1',
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

  it('tap predicate matches both processed and failed events, not others', () => {
    let capturedPredicate: ((e: DomainEvent) => boolean) | null = null;
    const hub = new KnowledgeStreamHub((predicate, _handler) => {
      capturedPredicate = predicate as (e: DomainEvent) => boolean;
      return () => {};
    });
    hub.start();

    expect(capturedPredicate).not.toBeNull();
    const predicate = capturedPredicate!;

    expect(predicate(makeKnowledgeEvent('t1', 'f1', 'knowledge.file.processed'))).toBe(true);
    expect(predicate(makeKnowledgeEvent('t1', 'f1', 'knowledge.file.failed'))).toBe(true);

    const otherEvt: DomainEvent = {
      id: crypto.randomUUID(),
      occurredAt: new Date(),
      tenantId: 't1',
      aggregateType: 'planner.task',
      aggregateId: 'x',
      eventType: 'planner.task.created',
      eventVersion: 1,
      payload: {},
    };
    expect(predicate(otherEvt)).toBe(false);
  });
});

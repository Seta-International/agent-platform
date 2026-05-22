import type { DomainEvent } from '@seta/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeStreamHub } from '../src/knowledge-stream/hub.ts';

function makeKnowledgeEvent(
  tenantId: string,
  fileId: string,
  eventType: 'copilot.tenant_knowledge.processed' | 'copilot.tenant_knowledge.failed',
  errorReason?: string,
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId,
    aggregateType: 'copilot.tenant_knowledge',
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
    const hub = new KnowledgeStreamHub(addTap as any);
    hub.start();

    const send = vi.fn();
    hub.register({ id: 'c1', tenant_id: 't1', send, close: () => {} });

    registered!(makeKnowledgeEvent('t1', 'f1', 'copilot.tenant_knowledge.processed'));

    expect(send).toHaveBeenCalledWith({ file_id: 'f1', status: 'ready', error_reason: null });
  });

  it('does not fan out across tenants', () => {
    let registered: ((e: DomainEvent) => void) | undefined;
    const addTap = vi.fn((_p, h) => {
      registered = h;
      return () => {};
    });
    const hub = new KnowledgeStreamHub(addTap as any);
    hub.start();

    const sendT1 = vi.fn();
    const sendT2 = vi.fn();
    hub.register({ id: 'c1', tenant_id: 't1', send: sendT1, close: () => {} });
    hub.register({ id: 'c2', tenant_id: 't2', send: sendT2, close: () => {} });

    registered!(makeKnowledgeEvent('t1', 'f1', 'copilot.tenant_knowledge.processed'));

    expect(sendT1).toHaveBeenCalledOnce();
    expect(sendT2).not.toHaveBeenCalled();
  });

  it('emits status=failed with error_reason for failed events', () => {
    let registered: ((e: DomainEvent) => void) | undefined;
    const addTap = vi.fn((_p, h) => {
      registered = h;
      return () => {};
    });
    const hub = new KnowledgeStreamHub(addTap as any);
    hub.start();

    const send = vi.fn();
    hub.register({ id: 'c1', tenant_id: 't1', send, close: () => {} });

    registered!(makeKnowledgeEvent('t1', 'f2', 'copilot.tenant_knowledge.failed', 'parse error'));

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
    const hub = new KnowledgeStreamHub(addTap as any);
    hub.start();

    const send = vi.fn();
    hub.register({ id: 'c1', tenant_id: 't1', send, close: () => {} });

    const badEvt: DomainEvent = {
      id: crypto.randomUUID(),
      occurredAt: new Date(),
      tenantId: 't1',
      aggregateType: 'copilot.tenant_knowledge',
      aggregateId: 'f1',
      eventType: 'copilot.tenant_knowledge.processed',
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

    expect(predicate(makeKnowledgeEvent('t1', 'f1', 'copilot.tenant_knowledge.processed'))).toBe(
      true,
    );
    expect(predicate(makeKnowledgeEvent('t1', 'f1', 'copilot.tenant_knowledge.failed'))).toBe(true);

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

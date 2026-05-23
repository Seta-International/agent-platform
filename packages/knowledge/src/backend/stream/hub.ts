import { addEventTap, type EventTapHandler, type EventTapPredicate } from '@seta/core';
import type { DomainEvent } from '@seta/shared-types';

type AddTapFn = (p: EventTapPredicate, h: EventTapHandler) => () => void;

interface Connection {
  id: string;
  tenant_id: string;
  send: (event: {
    file_id: string;
    status: 'ready' | 'failed';
    error_reason: string | null;
  }) => void;
  close: () => void;
}

export class KnowledgeStreamHub {
  private connections = new Map<string, Connection>();
  private unsub: (() => void) | null = null;
  private readonly addTap: AddTapFn;

  constructor(addTapFn: AddTapFn = addEventTap) {
    this.addTap = addTapFn;
  }

  start(): void {
    this.unsub = this.addTap(
      (e) => e.eventType === 'knowledge.file.processed' || e.eventType === 'knowledge.file.failed',
      (e) => this.fanOut(e),
    );
  }

  stop(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
    for (const c of this.connections.values()) c.close();
    this.connections.clear();
  }

  register(c: Connection): void {
    this.connections.set(c.id, c);
  }

  unregister(id: string): void {
    this.connections.delete(id);
  }

  fanOut(e: DomainEvent): void {
    const payload = e.payload as {
      tenant_id?: string;
      file_id?: string;
      error_reason?: string | null;
    };
    if (!payload.tenant_id || !payload.file_id) return;
    const status: 'ready' | 'failed' =
      e.eventType === 'knowledge.file.processed' ? 'ready' : 'failed';
    for (const conn of this.connections.values()) {
      if (conn.tenant_id === payload.tenant_id) {
        conn.send({
          file_id: payload.file_id,
          status,
          error_reason: payload.error_reason ?? null,
        });
      }
    }
  }

  connectionCount(): number {
    return this.connections.size;
  }
}

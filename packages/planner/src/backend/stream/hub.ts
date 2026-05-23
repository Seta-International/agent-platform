import { addEventTap, type EventTapHandler, type EventTapPredicate } from '@seta/core';
import type { DomainEvent } from '@seta/shared-types';

type AddTapFn = (p: EventTapPredicate, h: EventTapHandler) => () => void;

interface Connection {
  id: string;
  filterGroupIds: Set<string>;
  send: (eventType: string, payload: unknown) => void;
  close: () => void;
}

export class BoardStreamHub {
  private connections = new Map<string, Connection>();
  private unsub: (() => void) | null = null;
  private readonly addTap: AddTapFn;

  constructor(addTapFn: AddTapFn = addEventTap) {
    this.addTap = addTapFn;
  }

  start(): void {
    this.unsub = this.addTap(
      (e) => e.eventType.startsWith('planner.'),
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
    const groupId = (e.payload as { group_id?: string })?.group_id;
    if (!groupId) return;
    for (const conn of this.connections.values()) {
      if (conn.filterGroupIds.has(groupId)) {
        conn.send(e.eventType, e);
      }
    }
  }

  connectionCount(): number {
    return this.connections.size;
  }
}

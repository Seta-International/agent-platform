import type { DomainEvent, DomainEventInput } from '@seta/shared-types';

export interface EventBusLike {
  emit<P>(event: DomainEventInput<P>): Promise<void>;
}

export class FakeEventBus implements EventBusLike {
  readonly sent: DomainEvent[] = [];

  async emit<P>(event: DomainEventInput<P>): Promise<void> {
    this.sent.push({
      ...event,
      id: crypto.randomUUID(),
      occurredAt: new Date(),
    });
  }

  async drainOnce<P>(handler: (e: DomainEvent<P>) => Promise<void>): Promise<void> {
    for (const e of this.sent) await handler(e as DomainEvent<P>);
  }

  reset(): void {
    this.sent.length = 0;
  }
}

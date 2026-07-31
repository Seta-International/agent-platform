import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type NodeTx = NodePgDatabase<Record<string, unknown>>;

export interface ActorContext {
  userId: string;
  tenantId: string;
  ip?: string;
  userAgent?: string;
  /** Who physically performed the write. Defaults to 'user' when absent, so every
   *  existing caller keeps its current audit shape. */
  actorKind?: 'user' | 'agent';
  /** For actorKind 'agent': the human user id the assistant is acting for. */
  onBehalfOf?: string;
}

export interface DomainEvent<P = unknown> {
  id: string;
  occurredAt: Date;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  payload: P;
  causedByUserId?: string;
  causedByEventId?: string;
  traceId?: string;
  actor?: ActorContext;
}

export interface DomainEventInput<P = unknown>
  extends Omit<DomainEvent<P>, 'id' | 'occurredAt' | 'traceId' | 'causedByEventId' | 'actor'> {}

export interface SubscriberCtx {
  tx: NodeTx;
}

export interface SubscriberDef<P = unknown> {
  subscription: string;
  event: string;
  eventVersion: number;
  handler: (event: DomainEvent<P>, ctx: SubscriberCtx) => Promise<void>;
}

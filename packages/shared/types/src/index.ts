import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';

export type ModuleKey = 'core' | 'identity' | 'planner' | 'copilot' | 'integrations';

export interface ActorContext {
  userId: string;
  tenantId: string;
  ip?: string;
  userAgent?: string;
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

export type { Pool, PoolClient };
export type NodeTx = NodePgDatabase<Record<string, unknown>>;

export interface SubscriberCtx {
  tx: NodeTx;
}

export interface SubscriberDef<P = unknown> {
  subscription: string;
  event: string;
  eventVersion: number;
  handler: (event: DomainEvent<P>, ctx: SubscriberCtx) => Promise<void>;
}

export type WorkflowBuilder<TMastra = unknown> = (mastra: TMastra) => unknown;

import { trace as otelTrace } from '@opentelemetry/api';
import type { DomainEventInput } from '@seta/shared-types';
import { coreEvents } from '../db/schema/index.ts';
import { emitContext } from './context.ts';

export class EmitContextRequired extends Error {
  constructor() {
    super(
      'core.emit() called outside emitContext — wrap with withEmit() / withCoreEmitContext() / the dispatcher.',
    );
    this.name = 'EmitContextRequired';
  }
}

export async function emit<P>(event: DomainEventInput<P>): Promise<{ eventId: string }> {
  const ctx = emitContext.getStore();
  if (!ctx) throw new EmitContextRequired();

  const traceId = ctx.traceId ?? otelTrace.getActiveSpan()?.spanContext().traceId;
  const eventId = crypto.randomUUID();

  await ctx.tx.insert(coreEvents).values({
    id: eventId,
    tenantId: event.tenantId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    eventVersion: event.eventVersion,
    payload: event.payload as Record<string, unknown>,
    causedByUserId: event.causedByUserId ?? null,
    causedByEventId: ctx.causedByEventId ?? null,
    traceId: traceId ?? null,
    actor: ctx.actor
      ? {
          user_id: ctx.actor.userId,
          tenant_id: ctx.actor.tenantId,
          ip: ctx.actor.ip,
          user_agent: ctx.actor.userAgent,
        }
      : null,
  });
  return { eventId };
}

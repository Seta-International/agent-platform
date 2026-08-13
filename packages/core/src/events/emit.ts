import { trace as otelTrace } from '@opentelemetry/api';
import type { DomainEventInput } from '@seta/shared-types';
import { coreEvents } from '../db/schema/index.ts';
import { emitContext } from './context.ts';
import { captureActiveTraceContext } from './trace-context.ts';

export class EmitContextRequired extends Error {
  constructor() {
    super(
      'core.emit() called outside emitContext — wrap with withEmit() / withCoreEmitContext() / the dispatcher.',
    );
    this.name = 'EmitContextRequired';
  }
}

export async function emit<P>(event: DomainEventInput<P>): Promise<{ eventId: string }> {
  const result = await emitBatch([event]);
  // istanbul ignore next — unreachable: emitBatch(≥1) always returns ≥1
  if (!result[0]) throw new Error('emit returned no event');
  return result[0];
}

export async function emitBatch<P>(events: DomainEventInput<P>[]): Promise<{ eventId: string }[]> {
  if (events.length === 0) return [];
  const ctx = emitContext.getStore();
  if (!ctx) throw new EmitContextRequired();

  const traceId = ctx.traceId ?? otelTrace.getActiveSpan()?.spanContext().traceId;
  const captured = captureActiveTraceContext();

  const rows = events.map((event) => ({
    id: crypto.randomUUID(),
    tenantId: event.tenantId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    eventVersion: event.eventVersion,
    payload: event.payload as Record<string, unknown>,
    causedByUserId: event.causedByUserId ?? null,
    causedByEventId: ctx.causedByEventId ?? null,
    traceId: traceId ?? null,
    traceParent: captured.traceParent,
    traceState: captured.traceState,
    actor: ctx.actor
      ? {
          user_id: ctx.actor.userId,
          tenant_id: ctx.actor.tenantId,
          ip: ctx.actor.ip,
          user_agent: ctx.actor.userAgent,
          actor_kind: ctx.actor.actorKind ?? 'user',
          ...(ctx.actor.onBehalfOf !== undefined ? { on_behalf_of: ctx.actor.onBehalfOf } : {}),
        }
      : null,
    // `as never`: jsonb('before') carries no $type, so drizzle infers its insert type
    // as `unknown` and refuses a plain assignment. Deliberately untyped — these columns
    // hold arbitrary entity snapshots.
    before: (ctx.before ?? null) as never,
    after: (ctx.after ?? null) as never,
  }));

  await ctx.tx.insert(coreEvents).values(rows);
  ctx.emittedEventIds?.push(...rows.map((r) => r.id));
  return rows.map((r) => ({ eventId: r.id }));
}

import type { BreakerEventEmitter, BreakerOpenedEvent } from '@seta/copilot-sdk';
import { emit as coreEmit, withEmit as coreWithEmit } from '@seta/core/events';

interface Deps {
  withEmit: typeof coreWithEmit;
  emit: typeof coreEmit;
}

/**
 * Bridges the SDK's breaker-events DI seam to the platform outbox. Each
 * breaker-open event becomes a single `copilot.tool.breaker_opened` row in
 * core.events, written inside its own one-shot transaction (the event is
 * not tied to any domain mutation — it is operational telemetry).
 */
export function buildBreakerEmitter(
  deps: Deps = { withEmit: coreWithEmit, emit: coreEmit },
): BreakerEventEmitter {
  return async function emitBreaker(event: BreakerOpenedEvent): Promise<void> {
    try {
      await deps.withEmit({ actor: { userId: 'system', tenantId: event.tenant_id } }, async () => {
        await deps.emit({
          tenantId: event.tenant_id,
          aggregateType: 'copilot.tool',
          aggregateId: event.tool_id,
          eventType: 'copilot.tool.breaker_opened',
          eventVersion: 1,
          payload: event,
        });
      });
    } catch (err) {
      // The SDK already logs; we also log here to capture the local stack
      // (withEmit failure usually means DB is unhealthy, which is worth a
      // separate signal from the SDK's "emitter rejected" line).
      console.error('[copilot.tool.breaker_opened] outbox write failed', err);
    }
  };
}

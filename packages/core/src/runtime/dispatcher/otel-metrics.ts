import { metrics } from '@opentelemetry/api';
import type { DrainMetrics } from './drain.ts';

const meter = metrics.getMeter('@seta/core/dispatcher');

const failuresCounter = meter.createCounter('seta_dispatcher_subscriber_failures', {
  description: 'Subscriber handler exceptions, before retry/DLQ decision',
});

const processedCounter = meter.createCounter('seta_dispatcher_events_processed', {
  description: 'Events successfully handed to a subscriber and committed',
});

const dlqCounter = meter.createCounter('seta_dispatcher_dead_letter_total', {
  description: 'Events moved to the dead-letter table after maxAttempts',
});

const drainHistogram = meter.createHistogram('seta_dispatcher_drain_duration_ms', {
  description: 'Wallclock duration of one drainOne() call, per subscription',
  unit: 'ms',
});

// Observable gauge: per-subscription DLQ count over the last 24h. The dispatcher hands
// us a query callback at startup so the SDK can read the live count at export time
// (typically every 30s by default).
let dlqProvider: (() => Promise<Array<{ subscription: string; count: number }>>) | null = null;

export function setDlqProvider(
  p: (() => Promise<Array<{ subscription: string; count: number }>>) | null,
): void {
  dlqProvider = p;
}

meter
  .createObservableGauge('seta_dispatcher_dead_letter_24h', {
    description: 'Dead-letter row count per subscription over the last 24 hours',
  })
  .addCallback(async (result) => {
    if (!dlqProvider) return;
    try {
      const rows = await dlqProvider();
      for (const row of rows) {
        result.observe(row.count, { subscription: row.subscription });
      }
    } catch {
      // Metric callbacks must not throw — swallow and let the next export retry.
    }
  });

export interface DispatcherMetrics extends DrainMetrics {
  recordDrain(args: { subscription: string; processed: number; durationMs: number }): void;
}

export const otelDispatcherMetrics: DispatcherMetrics = {
  incr(name, labels) {
    const attrs = labels ?? {};
    switch (name) {
      case 'dispatcher.subscriber_failures':
        failuresCounter.add(1, attrs);
        return;
      case 'dispatcher.dead_letter':
        dlqCounter.add(1, attrs);
        return;
      default:
        return;
    }
  },
  recordDrain({ subscription, processed, durationMs }) {
    drainHistogram.record(durationMs, { subscription });
    if (processed > 0) {
      processedCounter.add(processed, { subscription });
    }
  },
};

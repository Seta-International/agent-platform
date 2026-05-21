import { metrics, type Tracer, trace } from '@opentelemetry/api';

const tracer: Tracer = trace.getTracer('planner');
const meter = metrics.getMeter('planner');

const taskFieldUpdatedCounter = meter.createCounter('planner.task.updated.field');

export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

export function recordTaskFieldUpdated(field: string): void {
  taskFieldUpdatedCounter.add(1, { field });
}

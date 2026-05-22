import { metrics, type Tracer, trace } from '@opentelemetry/api';

const tracer: Tracer = trace.getTracer('integrations.m365');
const meter = metrics.getMeter('integrations.m365');

export const planPullSuccessCounter = meter.createCounter('m365.plan.pull.success');
export const planPullErrorCounter = meter.createCounter('m365.plan.pull.error');
export const planPullThrottledCounter = meter.createCounter('m365.plan.pull.throttled');
export const planPullConflictCounter = meter.createCounter('m365.plan.pull.conflict');
export const tasksWalkedHistogram = meter.createHistogram('m365.plan.pull.tasks_walked');
export const tasksChangedHistogram = meter.createHistogram('m365.plan.pull.tasks_changed');
export const assigneeSkippedCounter = meter.createCounter('m365.assignee.skipped.not_provisioned');

export const planPushSuccessCounter = meter.createCounter('m365.plan.push.success');
export const planPushErrorCounter = meter.createCounter('m365.plan.push.error');
export const planPushConflictCounter = meter.createCounter('m365.plan.push.conflict');
export const planPushPreconditionRetryCounter = meter.createCounter(
  'm365.plan.push.precondition_retry',
);
export const pushEchoSuppressedCounter = meter.createCounter('m365.push.echo_suppressed');

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

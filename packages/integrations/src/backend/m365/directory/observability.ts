import { metrics, type Tracer, trace } from '@opentelemetry/api';

/**
 * Directory-sync counters and spans (design §11), kept beside the `m365.plan.*` set in
 * `../observability.ts` and following its shape.
 *
 * Tracing lives here rather than in `directory/graph.ts`: unlike `plans/graph.ts`, the directory
 * Graph layer is deliberately span-free — a full census is thousands of per-user calls, and a span
 * each would bury the run. The orchestrator emits a handful of coarse spans instead.
 */
const tracer: Tracer = trace.getTracer('integrations.m365.directory');
const meter = metrics.getMeter('integrations.m365.directory');

export const directoryPullSuccessCounter = meter.createCounter('m365.directory.pull.success');
export const directoryPullErrorCounter = meter.createCounter('m365.directory.pull.error');
export const directoryPullThrottledCounter = meter.createCounter('m365.directory.pull.throttled');

export const directoryUsersSeenCounter = meter.createCounter('m365.directory.users.seen');
export const directoryUsersCreatedCounter = meter.createCounter('m365.directory.users.created');
export const directoryUsersUpdatedCounter = meter.createCounter('m365.directory.users.updated');
export const directoryUsersFilteredCounter = meter.createCounter('m365.directory.users.filtered');
export const directoryOrgUnitCreatedCounter = meter.createCounter(
  'm365.directory.org_unit.created',
);
export const directoryOrgUnitRenamedCounter = meter.createCounter(
  'm365.directory.org_unit.renamed',
);
export const directoryManagerAmbiguousCounter = meter.createCounter(
  'm365.directory.manager.ambiguous',
);
export const directoryPhotoMissingCounter = meter.createCounter('m365.directory.photo.missing');
export const directoryMailboxForbiddenCounter = meter.createCounter(
  'm365.directory.mailbox.forbidden',
);

export async function withDirectorySpan<T>(
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

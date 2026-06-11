import { Mastra } from '@mastra/core';
import { ConsoleLogger, type LogLevel } from '@mastra/core/logger';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { PostgresStore } from '@mastra/pg';
import type { Pool } from 'pg';
import { adaptMastraEvent, onLifecycleEvent } from './workflows/_infra/lifecycle-hook.ts';

interface Logger {
  error: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

export type AgentRuntimeDeps = {
  pool: Pool;
  databaseUrl: string;
  log?: Logger;
  /**
   * Pre-built store to wrap the runtime Mastra in. When provided, the runtime
   * reuses this instance instead of constructing its own PostgresStore — so the
   * engine Mastra and the staffing orchestrator's per-turn Mastra can share ONE
   * physical store (required for cross-Mastra-instance native-suspend resume).
   * Built at the composition root via createAgentMastraStorage.
   */
  storage?: MastraCompositeStore;
};

/**
 * Builds the store the agent runtime uses (PostgresStore, schema `agent`).
 * Exposed so the composition root can construct ONE store and hand the same
 * instance to both this engine runtime and the staffing orchestrator's per-turn
 * Mastra — cross-instance native-suspend resume requires a shared store.
 */
export function createAgentMastraStorage(deps: { pool: Pool }): MastraCompositeStore {
  return new PostgresStore({
    id: 'agent-store',
    schemaName: 'agent',
    pool: deps.pool,
  });
}

/**
 * Tracks in-flight lifecycle handler Promises so callers can await full
 * projection consistency before responding (e.g. the replay-from-step route
 * must wait for `workflow.suspend` → `UPDATE … SET status = 'paused'` before
 * returning, otherwise the client refetches stale data).
 *
 * Background: `EventEmitterPubSub.publish` calls `emitter.emit()`, which
 * invokes async handlers synchronously but never awaits their Promises.
 * `LifecycleDrainer.wrap` captures each handler's Promise so `drain()` can
 * await them all before the HTTP response is sent.
 */
export class LifecycleDrainer {
  readonly #pending = new Set<Promise<void>>();

  /** Wraps an async handler, registering its Promise so drain() can await it. */
  wrap(fn: (raw: unknown) => Promise<void>): (raw: unknown) => void {
    return (raw: unknown) => {
      const p = fn(raw).finally(() => this.#pending.delete(p));
      this.#pending.add(p);
    };
  }

  /**
   * Resolves once all in-flight lifecycle handler Promises have settled.
   * Safe to call when the set is empty (resolves immediately).
   * The while-loop handles the edge case where a handler enqueues another
   * handler during its own execution.
   */
  async drain(): Promise<void> {
    while (this.#pending.size > 0) {
      await Promise.allSettled([...this.#pending]);
    }
  }
}

/** Convenience wrapper for tests — returns only the Mastra instance. */
export function buildMastra(deps: AgentRuntimeDeps): Mastra {
  return buildMastraFull(deps).mastra;
}

/** Production entry-point — returns both the Mastra instance and the drainer. */
export function buildMastraFull(deps: AgentRuntimeDeps): {
  mastra: Mastra;
  drainer: LifecycleDrainer;
} {
  const storage = deps.storage ?? createAgentMastraStorage({ pool: deps.pool });
  const mastra = new Mastra({
    storage,
    // Framework-level logs (step/tool/suspend transitions, internal warnings).
    // WARN by default = high-signal, low-noise; raise via MASTRA_LOG_LEVEL when
    // actively debugging. Complements the structured AI-tracing spans below.
    logger: new ConsoleLogger({
      name: 'Mastra',
      level: (process.env.MASTRA_LOG_LEVEL as LogLevel) ?? 'warn',
    }),
    // AI tracing → agent.mastra_ai_spans (same shared store). One span tree per
    // agent turn: tool-calls, native suspends, resumes — the agent-behavior
    // truth that otherwise has to be reconstructed from mastra_messages by hand.
    observability: new Observability({
      configs: {
        default: {
          serviceName: 'seta-agent-engine',
          exporters: [new MastraStorageExporter()],
        },
      },
    }),
  });
  const drainer = wireLifecycleHook(mastra, deps.pool, deps.log);
  return { mastra, drainer };
}

function wireLifecycleHook(mastra: Mastra, pool: Pool, log?: Logger): LifecycleDrainer {
  const drainer = new LifecycleDrainer();
  const handle = async (raw: unknown): Promise<void> => {
    if (!raw || typeof raw !== 'object') return;
    const typed = raw as { type: string; runId: string; data?: Record<string, unknown> };

    // Log every workflow-level event so we can trace the HITL suspend path.
    if (typed.type?.startsWith('workflow.') && !typed.type.startsWith('workflow.step')) {
      const rc = typed.data?.requestContext;
      const hasRc = rc !== undefined;
      const threadIdRaw =
        hasRc && rc && typeof rc === 'object'
          ? (rc as { get?: unknown }).get && typeof (rc as { get: unknown }).get === 'function'
            ? (() => {
                try {
                  return (rc as { get: (k: string) => unknown }).get('thread_id');
                } catch {
                  return undefined;
                }
              })()
            : (rc as Record<string, unknown>).thread_id
          : undefined;
      if (log) {
        log.warn(
          {
            subsystem: 'agent.lifecycle-hook',
            event: 'mastra.raw',
            type: typed.type,
            runId: typed.runId,
            hasRc,
            threadId: threadIdRaw ?? null,
          },
          'mastra lifecycle event received',
        );
      } else {
        console.warn(
          '[agent.lifecycle-hook] mastra.raw',
          typed.type,
          'runId:',
          typed.runId,
          'hasRc:',
          hasRc,
          'threadId:',
          threadIdRaw ?? null,
        );
      }
    }

    const adapted = adaptMastraEvent(typed);
    if (!adapted) {
      // Surface any lifecycle event we couldn't translate so future Mastra
      // wire-format changes don't silently break the projection again.
      if (typed.type?.startsWith('workflow.') && !typed.type.startsWith('workflow.step')) {
        const warnObj = {
          subsystem: 'agent.lifecycle-hook',
          type: typed.type,
          runId: typed.runId,
          hasRc: typed.data?.requestContext !== undefined,
          rcKeys:
            typed.data?.requestContext && typeof typed.data.requestContext === 'object'
              ? Object.keys(typed.data.requestContext as object)
              : null,
        };
        if (log) {
          log.warn(warnObj, 'dropped untranslatable lifecycle event');
        } else {
          console.warn('[agent.workflow.lifecycle-hook] dropped untranslatable event', warnObj);
        }
      }
      return;
    }
    try {
      await onLifecycleEvent(pool, adapted);
    } catch (err) {
      // Surface to logs; never re-throw to Mastra — its publish path is fire-and-forget and a throw
      // would crash the EventEmitterPubSub listener chain for unrelated subscribers.
      if (log) {
        log.error(
          { subsystem: 'agent.lifecycle-hook', err, runId: adapted.runId, kind: adapted.kind },
          'lifecycle event handler failed; enqueuing dead-letter retry',
        );
      } else {
        console.error('[agent.workflow.lifecycle-hook] failed, enqueuing DLQ job', {
          runId: adapted.runId,
          kind: adapted.kind,
          err,
        });
      }
      // Dead-letter: enqueue for retry with graphile-worker's exponential backoff.
      // jobKey = runId:kind:eventSeq provides idempotency — duplicate failures for the
      // same event don't create duplicate jobs.
      const jobKey = `${adapted.runId}:${adapted.kind}:${adapted.eventSeq}`;
      pool
        .query(
          `SELECT graphile_worker.add_job(
             identifier   => $1,
             payload      => $2::json,
             max_attempts => $3,
             job_key      => $4
           )`,
          ['agent_lifecycle_retry', JSON.stringify(adapted), 6, jobKey],
        )
        .catch((dlqErr) => {
          if (log) {
            log.error(
              { subsystem: 'agent.lifecycle-hook', err: dlqErr, runId: adapted.runId },
              'failed to enqueue dead-letter lifecycle retry',
            );
          } else {
            console.error('[agent.workflow.lifecycle-hook] DLQ enqueue failed', dlqErr);
          }
        });
    }
  };
  const wrapped = drainer.wrap(handle);
  // EventEmitterPubSub.subscribe resolves synchronously in microseconds; void intentional.
  void mastra.pubsub.subscribe('workflows', wrapped);
  void mastra.pubsub.subscribe('workflows-finish', wrapped);
  return drainer;
}

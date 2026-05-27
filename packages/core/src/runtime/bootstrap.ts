import { type ServerType, serve } from '@hono/node-server';
import type { SubscriberDef } from '@seta/shared-types';
import type { Hono } from 'hono';
import type { Pool } from 'pg';

// Hono<E, S, BasePath> is invariant in E; the bootstrap can't know each app's env shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// biome-ignore lint/suspicious/noExplicitAny: external Hono generic invariance
type AnyHono = Hono<any, any, any>;

import type { ContributionRegistry, StreamHubHandle } from '../composition/registry.ts';
import {
  type DispatcherHandle,
  type SubscriptionHealth,
  startDispatcher,
} from './dispatcher/index.ts';
import { type StartWorkerPoolOpts, startWorkerPool, type WorkerHandle } from './workers/index.ts';

export interface BuildRuntimeEnv {
  PORT: number;
  DATABASE_URL: string;
}

export interface DispatcherSnapshot {
  health(): Promise<{ lastTickAt: Date; subscriptions: SubscriptionHealth[] }>;
}

export interface BuildServerAppArgs {
  workers: WorkerHandle;
  pool: Pool;
  dispatcher: DispatcherSnapshot;
  streams: ReadonlyMap<string, StreamHubHandle>;
}

export interface BuildRuntimeDeps {
  reg: ContributionRegistry;
  pool: Pool;
  /**
   * Structured logger (e.g. a pino child). When provided, dispatcher and worker
   * subsystems use it instead of falling back to console.*.
   */
  log?: import('./dispatcher/index.ts').DrainLogger;
  /**
   * Extra subscribers beyond reg.collected.subscribers. apps/server appends
   * failedLoginAlertSubscriber which depends on the mailer being wired first.
   */
  extraSubscribers?: SubscriberDef[];
  /** Extra graphile-worker job handlers beyond the registry's contributions. */
  extraJobs?: StartWorkerPoolOpts['jobs'];
  /**
   * Builds the Hono app for HTTP. Called once during startServerRuntime; not called
   * by startWorkerRuntime.
   */
  buildServerApp: (args: BuildServerAppArgs) => AnyHono;
  /**
   * Hook fired before the HTTP server starts. Receives the (already-running) worker
   * handle so the mailer/m365 boot can register itself, plus the started stream
   * hubs keyed by module name.
   */
  onServerStart?: (args: {
    workers: WorkerHandle;
    streams: ReadonlyMap<string, StreamHubHandle>;
  }) => Promise<void> | void;
  /**
   * Hook fired after the worker pool + dispatcher start but before this function
   * resolves. apps/worker uses it to publish the WorkerHandle to closures that
   * the m365 boot's job handlers depend on at fire time.
   */
  onWorkerStart?: (args: { workers: WorkerHandle }) => Promise<void> | void;
}

export interface ServerRuntime {
  server: ServerType;
  shutdown: (signal: string) => Promise<void>;
}

export interface WorkerRuntime {
  shutdown: (signal: string) => Promise<void>;
}

export interface Runtime {
  startServerRuntime: () => Promise<ServerRuntime>;
  startWorkerRuntime: () => Promise<WorkerRuntime>;
  startBoth: () => Promise<ServerRuntime>;
}

interface DispatcherWiring {
  dispatcher: DispatcherHandle | null;
  workers: WorkerHandle | null;
  streams: Map<string, StreamHubHandle>;
}

const STUB_DISPATCHER_SNAPSHOT: DispatcherSnapshot = {
  health: async () => ({ lastTickAt: new Date(), subscriptions: [] }),
};

export function buildRuntime(env: BuildRuntimeEnv, deps: BuildRuntimeDeps): Runtime {
  const wiring: DispatcherWiring = {
    dispatcher: null,
    workers: null,
    streams: new Map<string, StreamHubHandle>(),
  };

  async function startWorkerRuntimeInternal(): Promise<void> {
    if (wiring.workers) return;
    const subs: SubscriberDef[] = [
      ...deps.reg.collected.subscribers,
      ...(deps.extraSubscribers ?? []),
    ];
    const jobs = {
      ...Object.fromEntries(deps.reg.collected.jobs),
      ...(deps.extraJobs ?? {}),
    };
    wiring.workers = await startWorkerPool({ pool: deps.pool, jobs, log: deps.log });
    if (deps.onWorkerStart) await deps.onWorkerStart({ workers: wiring.workers });
    wiring.dispatcher = await startDispatcher({
      pool: deps.pool,
      subscribers: subs,
      log: deps.log,
    });
  }

  async function startHttpServer(): Promise<ServerRuntime> {
    if (!wiring.workers) {
      wiring.workers = enqueueOnlyWorkerHandle(deps.pool);
    }
    for (const { module, builder } of deps.reg.collected.streamHubBuilders) {
      wiring.streams.set(module, builder({ pool: deps.pool }));
    }
    for (const handle of wiring.streams.values()) {
      await handle.start();
    }
    if (deps.onServerStart) {
      await deps.onServerStart({ workers: wiring.workers, streams: wiring.streams });
    }
    const app = deps.buildServerApp({
      workers: wiring.workers,
      pool: deps.pool,
      dispatcher: wiring.dispatcher ?? STUB_DISPATCHER_SNAPSHOT,
      streams: wiring.streams,
    });
    const server = serve({ fetch: app.fetch, port: env.PORT });
    return { server, shutdown: makeShutdown(server, wiring) };
  }

  return {
    startServerRuntime: startHttpServer,
    startWorkerRuntime: async () => {
      await startWorkerRuntimeInternal();
      return { shutdown: makeShutdown(null, wiring) };
    },
    startBoth: async () => {
      await startWorkerRuntimeInternal();
      return startHttpServer();
    },
  };
}

function makeShutdown(
  server: ServerType | null,
  wiring: DispatcherWiring,
): (signal: string) => Promise<void> {
  let shuttingDown = false;
  return async (_signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (server) await new Promise<void>((r) => server.close(() => r()));
    for (const handle of wiring.streams.values()) {
      await handle.stop();
    }
    if (wiring.dispatcher) await wiring.dispatcher.shutdown(15_000);
    if (wiring.workers) await wiring.workers.shutdown();
  };
}

function enqueueOnlyWorkerHandle(pool: Pool): WorkerHandle {
  return {
    async shutdown() {
      // no-op: nothing started locally
    },
    async addJob(identifier, payload, spec) {
      // Direct insert into graphile-worker's job table. Avoids spinning up a full
      // worker pool when the process only enqueues (apps/server in production).
      const jobKey = spec?.jobKey ?? null;
      const maxAttempts = spec?.maxAttempts ?? null;
      const queueName = spec?.queueName ?? null;
      const runAt = spec?.runAt ?? null;
      await pool.query(
        `SELECT graphile_worker.add_job(
           identifier => $1,
           payload => $2::json,
           queue_name => $3,
           run_at => $4,
           max_attempts => $5,
           job_key => $6
         )`,
        [identifier, JSON.stringify(payload ?? {}), queueName, runAt, maxAttempts, jobKey],
      );
    },
  };
}

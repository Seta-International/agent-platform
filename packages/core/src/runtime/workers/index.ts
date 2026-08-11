import { type Runner, run, type Task, type TaskList } from 'graphile-worker';
import type { Pool } from 'pg';
import { captureException } from '../../composition/error-capture.ts';
import { subscriptionDlqAlerter } from './dlq-alerter.ts';
import { graphileWorkerLogger, type WorkerLogger } from './logger.ts';
import { partitionManagerTick } from './partition-manager.ts';
import { retentionTick } from './retention.ts';

function withErrorCapture(task: Task): Task {
  return async (payload, helpers) => {
    try {
      return await task(payload, helpers);
    } catch (err) {
      captureException(err);
      throw err;
    }
  };
}

export interface StartWorkerPoolOpts {
  pool: Pool;
  jobs?: TaskList;
  crontab?: string;
  extraCrontab?: string;
  log?: WorkerLogger;
}

export interface WorkerHandle {
  shutdown(): Promise<void>;
  addJob(
    identifier: string,
    payload?: unknown,
    spec?: {
      jobKey?: string;
      /**
       * What to do when `jobKey` already names a pending job. Defaults to graphile-worker's
       * `'replace'`, which overwrites its payload — so a periodic enqueue can silently discard a
       * one-off someone else queued under the same key. `'unsafe_dedupe'` keeps the existing job
       * untouched, which is what a cron wants when a user-triggered run may be waiting.
       */
      jobKeyMode?: 'replace' | 'preserve_run_at' | 'unsafe_dedupe';
      maxAttempts?: number;
      queueName?: string;
      runAt?: Date;
    },
  ): Promise<void>;
}

export async function startWorkerPool(opts: StartWorkerPoolOpts): Promise<WorkerHandle> {
  const rawTaskList: TaskList = {
    partition_manager_tick: async () => {
      await partitionManagerTick();
    },
    retention_tick: async () => {
      await retentionTick();
    },
    subscription_dlq_alerter: async () => {
      await subscriptionDlqAlerter(opts.log);
    },
    ...(opts.jobs ?? {}),
  };
  const taskList: TaskList = Object.fromEntries(
    Object.entries(rawTaskList)
      .filter((entry): entry is [string, Task] => entry[1] !== undefined)
      .map(([name, task]) => [name, withErrorCapture(task)]),
  );

  const defaultCrontab = `
0 3 * * * partition_manager_tick
15 3 * * * retention_tick
*/5 * * * * subscription_dlq_alerter
`;
  const crontab = [opts.crontab ?? defaultCrontab, opts.extraCrontab]
    .filter((value): value is string => !!value && value.trim().length > 0)
    .join('\n')
    .trim();

  const runner: Runner = await run({
    pgPool: opts.pool,
    taskList,
    crontab,
    concurrency: 5,
    ...(opts.log ? { logger: graphileWorkerLogger(opts.log) } : {}),
  });

  return {
    async shutdown() {
      await runner.stop();
    },
    async addJob(identifier, payload, spec) {
      await runner.addJob(identifier, payload, spec);
    },
  };
}

export { partitionManagerTick, subscriptionDlqAlerter };

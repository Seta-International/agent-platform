import { type Runner, run, type TaskList } from 'graphile-worker';
import type { Pool } from 'pg';
import { subscriptionDlqAlerter } from './dlq-alerter.ts';
import { partitionManagerTick } from './partition-manager.ts';

export interface StartWorkerPoolOpts {
  pool: Pool;
  jobs?: TaskList;
  crontab?: string;
}

export interface WorkerHandle {
  shutdown(): Promise<void>;
  addJob(
    identifier: string,
    payload?: unknown,
    spec?: { jobKey?: string; maxAttempts?: number; queueName?: string; runAt?: Date },
  ): Promise<void>;
}

export async function startWorkerPool(opts: StartWorkerPoolOpts): Promise<WorkerHandle> {
  const taskList: TaskList = {
    partition_manager_tick: async () => {
      await partitionManagerTick();
    },
    subscription_dlq_alerter: async () => {
      await subscriptionDlqAlerter();
    },
    ...(opts.jobs ?? {}),
  };

  const crontab = (
    opts.crontab ??
    `
0 3 * * * partition_manager_tick
*/5 * * * * subscription_dlq_alerter
`
  ).trim();

  const runner: Runner = await run({
    pgPool: opts.pool,
    taskList,
    crontab,
    concurrency: 5,
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

import { type Runner, run, type Task, type TaskList } from 'graphile-worker';
import type { Pool } from 'pg';
import { captureException } from '../../composition/error-capture.ts';
import { subscriptionDlqAlerter } from './dlq-alerter.ts';
import { partitionManagerTick } from './partition-manager.ts';

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
  log?: import('./dlq-alerter.ts').DlqAlerterLogger;
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
  const rawTaskList: TaskList = {
    partition_manager_tick: async () => {
      await partitionManagerTick();
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

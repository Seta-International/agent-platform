import { describe, expect, it } from 'vitest';
import { graphileWorkerLogger, type WorkerLogger } from '../../src/runtime/workers/logger.ts';

function recordingLogger() {
  const calls: Record<'error' | 'warn' | 'info' | 'debug', Array<[unknown, string?]>> = {
    error: [],
    warn: [],
    info: [],
    debug: [],
  };
  const log: WorkerLogger = {
    error: (obj, msg) => calls.error.push([obj, msg]),
    warn: (obj, msg) => calls.warn.push([obj, msg]),
    info: (obj, msg) => calls.info.push([obj, msg]),
    debug: (obj, msg) => calls.debug.push([obj, msg]),
  };
  return { calls, log };
}

describe('graphileWorkerLogger', () => {
  it('routes graphile levels to the structured logger with the message intact', () => {
    const { calls, log } = recordingLogger();
    const logger = graphileWorkerLogger(log);

    logger.error('job failed');
    logger.warn('job retried');
    logger.info('job completed');
    logger.debug('job details');

    expect(calls.error).toHaveLength(1);
    expect(calls.error[0]?.[1]).toBe('job failed');
    expect(calls.warn).toHaveLength(1);
    expect(calls.warn[0]?.[1]).toBe('job retried');
    expect(calls.info).toHaveLength(1);
    expect(calls.info[0]?.[1]).toBe('job completed');
    expect(calls.debug).toHaveLength(1);
    expect(calls.debug[0]?.[1]).toBe('job details');
  });

  it('carries scope fields (worker/task ids) as structured data', () => {
    const { calls, log } = recordingLogger();
    const logger = graphileWorkerLogger(log).scope({
      workerId: 'worker-abc',
      taskIdentifier: 'subscription_dlq_alerter',
    });

    logger.info('Completed task 4633');

    const [fields, msg] = calls.info[0] ?? [];
    expect(msg).toBe('Completed task 4633');
    expect(fields).toMatchObject({
      workerId: 'worker-abc',
      taskIdentifier: 'subscription_dlq_alerter',
    });
  });

  it('drops info/debug silently when the logger only has error/warn', () => {
    const errors: string[] = [];
    const logger = graphileWorkerLogger({
      error: (_obj, msg) => errors.push(msg ?? ''),
      warn: () => {},
    });

    expect(() => {
      logger.info('completed');
      logger.debug('noise');
      logger.error('boom');
    }).not.toThrow();
    expect(errors).toEqual(['boom']);
  });
});

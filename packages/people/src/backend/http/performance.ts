import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import {
  cycleStatusQuery,
  monthTasksQuery,
  performanceContextInput,
  savePerformanceConfigInput,
} from '../../contracts.ts';
import { vnYearMonth } from '../domain/month-clock.ts';
import { parseCycleMonthOrThrow, readCycleStatus } from '../domain/read-cycle-status.ts';
import { readMonthTasks } from '../domain/read-month-tasks.ts';
import { readPerformanceConfig } from '../domain/read-performance-config.ts';
import { readPerformanceContext } from '../domain/read-performance-context.ts';
import { savePerformanceConfig } from '../domain/save-performance-config.ts';

export function registerPeoplePerformanceRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/people/v1/performance/context', async (c) => {
    const input = performanceContextInput.parse({
      as_of_month: c.req.query('as_of_month') ?? vnYearMonth(),
    });
    return c.json(await readPerformanceContext(c.get('user'), input));
  });

  app.get('/api/people/v1/performance/cycle-status', async (c) => {
    const input = cycleStatusQuery.parse({
      month: parseCycleMonthOrThrow(c.req.query('month')),
    });
    return c.json(await readCycleStatus(c.get('user'), input));
  });

  app.get('/api/people/v1/performance/month-tasks', async (c) => {
    const input = monthTasksQuery.parse({
      month: parseCycleMonthOrThrow(c.req.query('month')),
    });
    return c.json(await readMonthTasks(c.get('user'), input));
  });

  app.get('/api/people/v1/performance/accounts/:accountId/config', async (c) => {
    const accountId = c.req.param('accountId');
    return c.json(await readPerformanceConfig(c.get('user'), accountId));
  });

  app.put('/api/people/v1/performance/accounts/:accountId/config', async (c) => {
    const accountId = c.req.param('accountId');
    const body = await c.req.json();
    const input = savePerformanceConfigInput.parse({ ...body, account_id: accountId });
    return c.json(await savePerformanceConfig(c.get('user'), input));
  });
}

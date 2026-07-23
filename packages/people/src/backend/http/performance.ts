import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { cycleStatusQuery, performanceContextInput } from '../../contracts.ts';
import { parseCycleMonthOrThrow, readCycleStatus } from '../domain/read-cycle-status.ts';
import { readPerformanceContext } from '../domain/read-performance-context.ts';

export function registerPeoplePerformanceRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/people/v1/performance/context', async (c) => {
    const input = performanceContextInput.parse({
      as_of_month: c.req.query('as_of_month') ?? new Date().toISOString().slice(0, 7),
    });
    return c.json(await readPerformanceContext(c.get('user'), input));
  });

  app.get('/api/people/v1/performance/cycle-status', async (c) => {
    const input = cycleStatusQuery.parse({
      month: parseCycleMonthOrThrow(c.req.query('month')),
    });
    return c.json(await readCycleStatus(c.get('user'), input));
  });
}

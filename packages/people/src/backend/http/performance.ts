import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import {
  cycleRelockInput,
  cycleStatusQuery,
  cycleUnlockInput,
  evaluationTargetQuery,
  evaluationWriteInput,
  monthTasksQuery,
  performanceContextInput,
  performanceRollupQuery,
  savePerformanceConfigInput,
} from '../../contracts.ts';
import { readCycleUnlockPanel, relockCycle, unlockCycle } from '../domain/cycle-unlock.ts';
import { readEvaluation, saveEvaluationDraft, submitEvaluation } from '../domain/evaluation.ts';
import { vnYearMonth } from '../domain/month-clock.ts';
import { parseCycleMonthOrThrow, readCycleStatus } from '../domain/read-cycle-status.ts';
import { readMonthTasks } from '../domain/read-month-tasks.ts';
import { readPerformanceConfig } from '../domain/read-performance-config.ts';
import { readPerformanceContext } from '../domain/read-performance-context.ts';
import { readPerformanceRollup } from '../domain/read-performance-rollup.ts';
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
      account_id: c.req.query('account_id') ?? null,
    });
    return c.json(await readCycleStatus(c.get('user'), input));
  });

  app.get('/api/people/v1/performance/month-tasks', async (c) => {
    const input = monthTasksQuery.parse({
      month: parseCycleMonthOrThrow(c.req.query('month')),
    });
    return c.json(await readMonthTasks(c.get('user'), input));
  });

  app.get('/api/people/v1/performance/rollup', async (c) => {
    const input = performanceRollupQuery.parse({
      month: parseCycleMonthOrThrow(c.req.query('month')),
      scope: c.req.query('scope'),
      account_id: c.req.query('account_id') ?? null,
      project_id: c.req.query('project_id') ?? null,
    });
    return c.json(await readPerformanceRollup(c.get('user'), input));
  });

  app.get('/api/people/v1/performance/evaluation', async (c) => {
    const input = evaluationTargetQuery.parse({
      month: parseCycleMonthOrThrow(c.req.query('month')),
      subject_person_id: c.req.query('subject_person_id'),
      project_id: c.req.query('project_id'),
    });
    return c.json(await readEvaluation(c.get('user'), input));
  });

  app.put('/api/people/v1/performance/evaluation', async (c) => {
    const input = evaluationWriteInput.parse(await c.req.json());
    return c.json(await saveEvaluationDraft(c.get('user'), input));
  });

  app.post('/api/people/v1/performance/evaluation/submit', async (c) => {
    const input = evaluationWriteInput.parse(await c.req.json());
    return c.json(await submitEvaluation(c.get('user'), input));
  });

  app.get('/api/people/v1/performance/cycle-unlocks', async (c) => {
    return c.json(await readCycleUnlockPanel(c.get('user')));
  });

  app.post('/api/people/v1/performance/cycle-unlocks', async (c) => {
    const input = cycleUnlockInput.parse(await c.req.json());
    return c.json(await unlockCycle(c.get('user'), input));
  });

  app.post('/api/people/v1/performance/cycle-relocks', async (c) => {
    const input = cycleRelockInput.parse(await c.req.json());
    return c.json(await relockCycle(c.get('user'), input));
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

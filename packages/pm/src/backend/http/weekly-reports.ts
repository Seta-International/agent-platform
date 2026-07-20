import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import {
  addReportCommentInput,
  ensureWeeklyReportInput,
  overrideFlagInput,
  upsertWeeklyReportInput,
  weeklyReportDetailQuery,
  weeklyReportsQuery,
} from '../../contracts.ts';
import {
  addReportComment,
  ensureWeeklyReport,
  getCurrentIsoWeek,
  getWeeklyReportDetail,
  listWeeklyReports,
  overrideFlag,
  upsertWeeklyReport,
} from '../../index.ts';

export function registerPmWeeklyReportsRoutes(app: Hono<SessionEnv>): void {
  // FUT-589 AC2: the current reporting week is server-authoritative (Asia/Ho_Chi_Minh) —
  // week pickers anchor on this instead of the browser clock.
  app.get('/api/pm/v1/current-week', (c) => c.json(getCurrentIsoWeek()));

  app.get('/api/pm/v1/weekly-reports', async (c) => {
    const parsed = weeklyReportsQuery.safeParse(c.req.query());
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await listWeeklyReports({ ...parsed.data, session: c.get('user') }));
  });

  app.get('/api/pm/v1/weekly-reports/detail', async (c) => {
    const parsed = weeklyReportDetailQuery.safeParse(c.req.query());
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await getWeeklyReportDetail({ ...parsed.data, session: c.get('user') }));
  });

  // FUT-591: draft-on-entry — the composer calls this when it opens so every write screen
  // targets one existing report; idempotent, returns the existing report untouched.
  app.post('/api/pm/v1/weekly-reports/ensure', async (c) => {
    const parsed = ensureWeeklyReportInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await ensureWeeklyReport({ ...parsed.data, session: c.get('user') }));
  });

  app.put('/api/pm/v1/weekly-reports', async (c) => {
    const parsed = upsertWeeklyReportInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await upsertWeeklyReport({ ...parsed.data, session: c.get('user') }));
  });

  app.post('/api/pm/v1/weekly-reports/flags/override', async (c) => {
    const parsed = overrideFlagInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await overrideFlag({ ...parsed.data, session: c.get('user') }));
  });

  app.post('/api/pm/v1/weekly-reports/comments', async (c) => {
    const parsed = addReportCommentInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await addReportComment({ ...parsed.data, session: c.get('user') }));
  });
}

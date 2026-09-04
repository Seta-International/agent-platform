import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import {
  completeInterviewInput,
  interviewOutcomeReasonInput,
  rescheduleInterviewInput,
  scheduleInterviewInput,
} from '../../contracts.ts';
import {
  cancelInterview,
  completeInterview,
  listInterviews,
  markInterviewNoShow,
  rescheduleInterview,
  scheduleInterview,
} from '../../index.ts';

const version = z.object({ expected_version: z.number().int().positive().optional() });
const rescheduleBody = version.extend({ input: rescheduleInterviewInput });
const completeBody = version.extend({ input: completeInterviewInput });
const outcomeReasonBody = version.extend({ input: interviewOutcomeReasonInput });

export function registerHiringInterviewRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/hiring/v1/interviews', async (c) =>
    c.json({ interviews: await listInterviews(c.get('user'), c.req.query('q')) }),
  );
  app.post('/api/hiring/v1/interviews', async (c) => {
    const parsed = scheduleInterviewInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await scheduleInterview({ ...parsed.data, session: c.get('user') }), 201);
  });
  app.post('/api/hiring/v1/interviews/:id/reschedule', async (c) => {
    const parsed = rescheduleBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await rescheduleInterview({
        interview_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/interviews/:id/complete', async (c) => {
    const parsed = completeBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await completeInterview({
        interview_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/interviews/:id/cancel', async (c) => {
    const parsed = outcomeReasonBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await cancelInterview({
        interview_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/interviews/:id/no-show', async (c) => {
    const parsed = outcomeReasonBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await markInterviewNoShow({
        interview_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
}

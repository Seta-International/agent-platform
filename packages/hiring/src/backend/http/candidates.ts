import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import {
  addCandidateInput,
  applicationStage,
  candidateSkillInput,
  editCandidatePatch,
  rejectApplicationInput,
  transferApplicationInput,
} from '../../contracts.ts';
import {
  addCandidate,
  editCandidate,
  getCandidate,
  getCandidateStageCounts,
  hireApplication,
  listCandidates,
  listRejectedCandidates,
  listTalentPool,
  moveApplicationStage,
  rejectApplication,
  setApplicationRating,
  setCandidateSkills,
  transferApplication,
} from '../../index.ts';

const version = z.object({ expected_version: z.number().int().positive().optional() });
const editBody = z.object({ patch: editCandidatePatch });
const skillsBody = z.object({ skills: z.array(candidateSkillInput) });
const moveBody = version.extend({ to: applicationStage });
const ratingBody = version.extend({ rating: z.number().int().min(0).max(5) });
const rejectBody = version.extend({ input: rejectApplicationInput });
const transferBody = version.extend({ input: transferApplicationInput });

export function registerHiringCandidateRoutes(app: Hono<SessionEnv>): void {
  // FUT-833: optional `q` filters rows by candidate name/contact (email/phone) server-side, so
  // contact PII never rides the full list payload.
  app.get('/api/hiring/v1/candidates', async (c) =>
    c.json({ candidates: await listCandidates(c.get('user'), c.req.query('q')) }),
  );
  app.get('/api/hiring/v1/candidates/stage-counts', async (c) =>
    c.json(await getCandidateStageCounts(c.get('user'))),
  );
  // Registered before `/candidates/:id` so the static segment wins the match.
  app.get('/api/hiring/v1/candidates/rejected', async (c) =>
    c.json({ candidates: await listRejectedCandidates(c.get('user'), c.req.query('q')) }),
  );
  app.get('/api/hiring/v1/talent-pool', async (c) =>
    c.json({ pool: await listTalentPool(c.get('user'), c.req.query('q')) }),
  );
  app.get('/api/hiring/v1/candidates/:id', async (c) =>
    c.json(await getCandidate({ candidate_id: c.req.param('id'), session: c.get('user') })),
  );
  app.post('/api/hiring/v1/candidates', async (c) => {
    const parsed = addCandidateInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(await addCandidate({ ...parsed.data, session: c.get('user') }), 201);
  });
  app.patch('/api/hiring/v1/candidates/:id', async (c) => {
    const parsed = editBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await editCandidate({
        candidate_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.put('/api/hiring/v1/candidates/:id/skills', async (c) => {
    const parsed = skillsBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await setCandidateSkills({
        candidate_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/applications/:id/stage', async (c) => {
    const parsed = moveBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await moveApplicationStage({
        application_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/applications/:id/rating', async (c) => {
    const parsed = ratingBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await setApplicationRating({
        application_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/applications/:id/hire', async (c) => {
    const parsed = version.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await hireApplication({
        application_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/applications/:id/reject', async (c) => {
    const parsed = rejectBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await rejectApplication({
        application_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/applications/:id/transfer', async (c) => {
    const parsed = transferBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await transferApplication({
        application_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/hiring/v1/applications/:id/hire', async (c) => {
    const parsed = version.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await hireApplication({
        application_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
}

import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { editProjectPatch, setProjectAccessInput, staffingPlanLineInput } from '../../contracts.ts';
import {
  closeProject,
  deleteStaffingPlanLine,
  editProject,
  getProject,
  linkPlannerGroup,
  listProjectAccess,
  listProjects,
  listStaffingPlan,
  reopenProject,
  setProjectAccess,
  upsertStaffingPlanLine,
} from '../../index.ts';

const editBody = z.object({
  expected_version: z.number().int().positive().optional(),
  patch: editProjectPatch,
});
const closeBody = z.object({ expected_version: z.number().int().positive().optional() });
const plannerBody = z.object({
  expected_version: z.number().int().positive().optional(),
  planner_group_id: z.string().uuid().nullable(),
});
const accessBody = setProjectAccessInput.omit({ project_id: true });
const planBody = staffingPlanLineInput.omit({ project_id: true });

export function registerPmProjectsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/pm/v1/projects', async (c) =>
    c.json({ projects: await listProjects(c.get('user')) }),
  );
  app.get('/api/pm/v1/projects/:id', async (c) =>
    c.json(await getProject({ project_id: c.req.param('id'), session: c.get('user') })),
  );
  app.patch('/api/pm/v1/projects/:id', async (c) => {
    const parsed = editBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await editProject({ project_id: c.req.param('id'), ...parsed.data, session: c.get('user') }),
    );
  });
  app.post('/api/pm/v1/projects/:id/close', async (c) => {
    const parsed = closeBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await closeProject({ project_id: c.req.param('id'), ...parsed.data, session: c.get('user') }),
    );
  });
  app.post('/api/pm/v1/projects/:id/reopen', async (c) => {
    const parsed = closeBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await reopenProject({
        project_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.post('/api/pm/v1/projects/:id/planner-link', async (c) => {
    const parsed = plannerBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await linkPlannerGroup({
        project_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.get('/api/pm/v1/projects/:id/access', async (c) =>
    c.json({
      access: await listProjectAccess({ project_id: c.req.param('id'), session: c.get('user') }),
    }),
  );
  app.put('/api/pm/v1/projects/:id/access', async (c) => {
    const parsed = accessBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await setProjectAccess({
        project_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.get('/api/pm/v1/projects/:id/staffing-plan', async (c) =>
    c.json({
      lines: await listStaffingPlan({ project_id: c.req.param('id'), session: c.get('user') }),
    }),
  );
  app.post('/api/pm/v1/projects/:id/staffing-plan', async (c) => {
    const parsed = planBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return c.json(
      await upsertStaffingPlanLine({
        project_id: c.req.param('id'),
        ...parsed.data,
        session: c.get('user'),
      }),
    );
  });
  app.delete('/api/pm/v1/projects/:id/staffing-plan/:lineId', async (c) =>
    c.json(
      await deleteStaffingPlanLine({
        project_id: c.req.param('id'),
        line_id: c.req.param('lineId'),
        session: c.get('user'),
      }),
    ),
  );
}

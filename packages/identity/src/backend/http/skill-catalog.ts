import {
  archiveSkill,
  archiveSkillCategory,
  CoreSkillError,
  createSkill,
  createSkillCategory,
  editSkill,
  editSkillCategory,
  listSkillCategories,
  listSkills,
  type SessionEnv,
} from '@seta/core';
import type { Context, Hono } from 'hono';
import { z } from 'zod';

const categoryCreate = z.object({
  name: z.string().min(1),
  sort_order: z.number().int().optional(),
});
const categoryPatch = z.object({
  name: z.string().min(1).optional(),
  sort_order: z.number().int().optional(),
  expected_version: z.number().int().positive().optional(),
});
const skillCreate = z.object({ category_id: z.string().uuid(), name: z.string().min(1) });
const skillPatch = z.object({
  category_id: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  expected_version: z.number().int().positive().optional(),
});
const archiveBody = z.object({ expected_version: z.number().int().positive().optional() });

function statusFor(code: CoreSkillError['code']): 400 | 403 | 404 | 409 {
  switch (code) {
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    default:
      return 400;
  }
}

async function guard<T>(c: Context<SessionEnv>, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CoreSkillError)
      return c.json({ error: err.code, message: err.message }, statusFor(err.code));
    throw err;
  }
}

export function registerSkillCatalogRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/skill-categories', async (c) => {
    const activeOnly = c.req.query('activeOnly') === 'true';
    return guard(c, async () =>
      c.json({ categories: await listSkillCategories(c.get('user'), { activeOnly }) }),
    );
  });

  app.post('/api/identity/v1/skill-categories', async (c) => {
    const parsed = categoryCreate.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return guard(c, async () =>
      c.json(await createSkillCategory({ input: parsed.data, session: c.get('user') }), 201),
    );
  });

  app.patch('/api/identity/v1/skill-categories/:id', async (c) => {
    const parsed = categoryPatch.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    const { expected_version, ...input } = parsed.data;
    return guard(c, async () =>
      c.json(
        await editSkillCategory({
          id: c.req.param('id'),
          expected_version,
          input,
          session: c.get('user'),
        }),
      ),
    );
  });

  app.post('/api/identity/v1/skill-categories/:id/archive', async (c) => {
    const parsed = archiveBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return guard(c, async () =>
      c.json(
        await archiveSkillCategory({
          id: c.req.param('id'),
          ...parsed.data,
          session: c.get('user'),
        }),
      ),
    );
  });

  app.get('/api/identity/v1/skills', async (c) => {
    const activeOnly = c.req.query('activeOnly') === 'true';
    const categoryId = c.req.query('categoryId') ?? undefined;
    return guard(c, async () =>
      c.json({ skills: await listSkills(c.get('user'), { activeOnly, categoryId }) }),
    );
  });

  app.post('/api/identity/v1/skills', async (c) => {
    const parsed = skillCreate.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return guard(c, async () =>
      c.json(await createSkill({ input: parsed.data, session: c.get('user') }), 201),
    );
  });

  app.patch('/api/identity/v1/skills/:id', async (c) => {
    const parsed = skillPatch.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    const { expected_version, ...input } = parsed.data;
    return guard(c, async () =>
      c.json(
        await editSkill({ id: c.req.param('id'), expected_version, input, session: c.get('user') }),
      ),
    );
  });

  app.post('/api/identity/v1/skills/:id/archive', async (c) => {
    const parsed = archiveBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    return guard(c, async () =>
      c.json(await archiveSkill({ id: c.req.param('id'), ...parsed.data, session: c.get('user') })),
    );
  });
}

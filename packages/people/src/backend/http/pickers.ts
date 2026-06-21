import type { SessionEnv } from '@seta/core';
import { listSkills } from '@seta/core';
import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
import type { Hono } from 'hono';
import { peopleDb } from '../db/client.ts';
import { accountProjection, projectProjection } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

export function registerPeoplePickersRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/people/v1/skills', async (c) => {
    const session = c.get('user');
    requirePermission(session, 'people.worker.read');
    const search = c.req.query('search') || undefined;
    const idsRaw = c.req.query('ids');
    const ids = idsRaw ? idsRaw.split(',').filter(Boolean) : undefined;
    const pageSize = parseInt(c.req.query('pageSize') ?? '20', 10) || 20;

    const all = await listSkills(session, ids ? undefined : { search });
    const filtered = ids ? all.filter((s) => ids.includes(s.id)) : all;
    const rows = filtered.slice(0, pageSize).map((s) => ({ id: s.id, name: s.name }));
    return c.json({ rows });
  });

  app.get('/api/people/v1/accounts', async (c) => {
    const session = c.get('user');
    requirePermission(session, 'people.worker.read');
    const search = c.req.query('search') || undefined;
    const idsRaw = c.req.query('ids');
    const ids = idsRaw ? idsRaw.split(',').filter(Boolean) : undefined;
    const pageSize = parseInt(c.req.query('pageSize') ?? '20', 10) || 20;

    const filters = [eq(accountProjection.tenant_id, session.tenant_id)];
    if (ids && ids.length > 0) {
      filters.push(inArray(accountProjection.account_id, ids));
    } else if (search) {
      filters.push(ilike(accountProjection.name, `%${search}%`));
    }

    const result = await peopleDb()
      .select({ id: accountProjection.account_id, name: accountProjection.name })
      .from(accountProjection)
      .where(and(...filters))
      .orderBy(asc(accountProjection.name))
      .limit(pageSize);

    return c.json({ rows: result });
  });

  app.get('/api/people/v1/projects', async (c) => {
    const session = c.get('user');
    requirePermission(session, 'people.worker.read');
    const search = c.req.query('search') || undefined;
    const idsRaw = c.req.query('ids');
    const ids = idsRaw ? idsRaw.split(',').filter(Boolean) : undefined;
    const accountIdsRaw = c.req.query('account_id');
    const accountIds = accountIdsRaw ? accountIdsRaw.split(',').filter(Boolean) : undefined;
    const pageSize = parseInt(c.req.query('pageSize') ?? '20', 10) || 20;

    const filters = [eq(projectProjection.tenant_id, session.tenant_id)];
    if (accountIds && accountIds.length > 0) {
      filters.push(inArray(projectProjection.account_id, accountIds));
    }
    if (ids && ids.length > 0) {
      filters.push(inArray(projectProjection.project_id, ids));
    } else if (search) {
      filters.push(ilike(projectProjection.name, `%${search}%`));
    }

    const result = await peopleDb()
      .select({ id: projectProjection.project_id, name: projectProjection.name })
      .from(projectProjection)
      .where(and(...filters))
      .orderBy(asc(projectProjection.name))
      .limit(pageSize);

    return c.json({ rows: result });
  });
}

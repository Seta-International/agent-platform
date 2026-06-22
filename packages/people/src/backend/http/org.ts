import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { getOrgDelivery, getOrgStructure } from '../../index.ts';

export function registerPeopleOrgRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/people/v1/org/structure', async (c) =>
    c.json(await getOrgStructure(c.get('user'))),
  );
  app.get('/api/people/v1/org/delivery', async (c) => c.json(await getOrgDelivery(c.get('user'))));
}

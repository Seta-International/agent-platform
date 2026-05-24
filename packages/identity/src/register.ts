import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { identityAgentTools } from './agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import {
  refreshUserProfileCreatedSubscriber,
  refreshUserProfileDeactivatedSubscriber,
  refreshUserProfileUpdatedSubscriber,
} from './backend/embeddings/subscribers/refresh-user-profile.ts';
import { buildIdentityRoutes } from './backend/http/index.ts';
import { IdentityError } from './backend/rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const identityErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof IdentityError)) return null;
  const status: ContentfulStatusCode =
    err.code === 'FORBIDDEN' ? 403 : err.code === 'USER_NOT_FOUND' ? 404 : 400;
  return { status, body: { error: err.code, message: err.message } };
};

export function registerIdentityContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'identity',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
    agentTools: identityAgentTools,
    subscribers: [
      refreshUserProfileCreatedSubscriber,
      refreshUserProfileUpdatedSubscriber,
      refreshUserProfileDeactivatedSubscriber,
    ],
    routes: { mountAt: '/', build: buildIdentityRoutes },
    errorMapper: identityErrorMapper,
  });
}

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { identityAgentTools, matchUsersToTopicTool } from './agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import {
  refreshUserProfileCreatedSubscriber,
  refreshUserProfileDeactivatedSubscriber,
  refreshUserProfileUpdatedSubscriber,
} from './backend/embeddings/subscribers/refresh-user-profile.ts';
import { buildIdentityRoutes } from './backend/http/index.ts';
import { IdentityError } from './backend/rbac.ts';
import {
  applyMemberAdded,
  applyMemberRemoved,
} from './backend/subscribers/planner-group-member.ts';
import { identityRbac } from './rbac.ts';

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
    rbac: identityRbac,
    migrationsDir: resolve(__dirname, '../drizzle'),
    agentTools: identityAgentTools,
    agentToolFactories: [matchUsersToTopicTool],
    subscribers: [
      refreshUserProfileCreatedSubscriber,
      refreshUserProfileUpdatedSubscriber,
      refreshUserProfileDeactivatedSubscriber,
      {
        event: 'planner.group.member.added',
        eventVersion: 1,
        subscription: 'identity.role-grants.planner-group-member.add',
        handler: applyMemberAdded as import('@seta/shared-types').SubscriberDef['handler'],
      },
      {
        event: 'planner.group.member.removed',
        eventVersion: 1,
        subscription: 'identity.role-grants.planner-group-member.remove',
        handler: applyMemberRemoved as import('@seta/shared-types').SubscriberDef['handler'],
      },
    ],
    routes: { mountAt: '/', build: buildIdentityRoutes },
    errorMapper: identityErrorMapper,
  });
}

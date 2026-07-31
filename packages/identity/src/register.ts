import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import { getLifecycleEntries, registerLifecycle } from '@seta/shared-db';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { identityAgentTools } from './agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import { buildIdentityRoutes } from './backend/http/index.ts';
import { IdentityError } from './backend/rbac.ts';
import { autoProvisionSubscribers } from './backend/subscribers/auto-provision.ts';
import { autoSuspendSubscribers } from './backend/subscribers/auto-suspend.ts';
import { entraLinkageSubscribers } from './backend/subscribers/entra-linkage.ts';
import { linkPersonSubscribers } from './backend/subscribers/link-person.ts';
import { orgUnitProjectionSubscribers } from './backend/subscribers/org-unit-projection.ts';
import { identityRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const identityErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof IdentityError)) return null;
  const status: ContentfulStatusCode =
    err.code === 'FORBIDDEN' ? 403 : err.code === 'USER_NOT_FOUND' ? 404 : 400;
  return { status, body: { error: err.code, message: err.message } };
};

export function registerIdentityContributions(reg: ContributionRegistry): void {
  // Tests construct a fresh ContributionRegistry per call (often several times per process),
  // but the shared-db lifecycle registry is process-global and throws on re-registering a
  // table — skip if a prior call in this process already ran.
  if (!getLifecycleEntries().some((e) => e.table === 'identity.user')) {
    registerLifecycle([
      { table: 'identity.user', policy: { kind: 'permanent' } },
      { table: 'identity.session', policy: { kind: 'permanent' } },
      { table: 'identity.account', policy: { kind: 'permanent' } },
      { table: 'identity.rate_limit', policy: { kind: 'permanent' } },
      { table: 'identity.verification', policy: { kind: 'permanent' } },
      { table: 'identity.role_assignments', policy: { kind: 'permanent' } },
      { table: 'identity.role_permission_overlays', policy: { kind: 'permanent' } },
      { table: 'identity.tenant_sso_providers', policy: { kind: 'permanent' } },
      { table: 'identity.access_group', policy: { kind: 'permanent' } },
      { table: 'identity.access_group_membership', policy: { kind: 'permanent' } },
      { table: 'identity.access_group_role', policy: { kind: 'permanent' } },
      // permanent while live, but tombstoned rows (deleted_at set, FUT-842) must not accumulate
      // forever: NULL < now() - interval is NULL in SQL, so this ttl policy only ever matches
      // and purges tombstones — live rows (deleted_at IS NULL) are never touched by it.
      {
        table: 'identity.org_unit_projection',
        policy: { kind: 'ttl', column: 'deleted_at', olderThan: '90 days' },
      },
      { table: 'identity.product_grant', policy: { kind: 'permanent' } },
      {
        table: 'identity.failed_login_attempts',
        policy: { kind: 'ttl', column: 'attempted_at', olderThan: '90 days' },
      },
      {
        table: 'identity.failed_login_alerts_sent',
        policy: { kind: 'ttl', column: 'last_sent_at', olderThan: '90 days' },
      },
    ]);
  }

  reg.module({
    name: 'identity',
    schema,
    rbac: identityRbac,
    migrationsDir: resolve(__dirname, '../drizzle'),
    agentTools: identityAgentTools,
    subscribers: [
      ...autoProvisionSubscribers,
      ...autoSuspendSubscribers,
      ...entraLinkageSubscribers,
      ...linkPersonSubscribers,
      ...orgUnitProjectionSubscribers,
    ],
    routes: { mountAt: '/', build: buildIdentityRoutes },
    errorMapper: identityErrorMapper,
  });
}

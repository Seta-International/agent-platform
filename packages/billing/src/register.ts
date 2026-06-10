import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BudgetExceededError,
  type ContributionRegistry,
  type ErrorMapper,
  registerBudgetGuard,
} from '@seta/core';
import { listTenantAdminUserIds } from '@seta/identity';
import { requestNotification } from '@seta/notifications';
import type { SubscriberDef } from '@seta/shared-types';
import { createBillingBudgetGuard } from './backend/budget-guard.ts';
import * as schema from './backend/db/schema/index.ts';
import { buildBillingRoutes } from './backend/http/index.ts';
import { BillingError } from './backend/rbac.ts';
import { usageRecorderSubscriber } from './backend/subscribers/usage-recorder.ts';
import { BILLING_EVENTS } from './events.ts';
import { BILLING_PERMISSIONS } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const BILLING_RBAC: Record<string, string> = Object.fromEntries(
  BILLING_PERMISSIONS.map((p) => [p, p]),
);

/**
 * Maps billing's domain errors to HTTP responses:
 * - Over-budget producers throw BudgetExceededError → 402.
 * - Missing billing.read on the usage endpoint throws BillingError FORBIDDEN → 403.
 */
export const billingErrorMapper: ErrorMapper = (err) => {
  if (err instanceof BudgetExceededError) {
    return {
      status: 402,
      body: { error: 'budget_exceeded', period: err.period, message: 'Tenant AI budget exceeded' },
    };
  }
  if (err instanceof BillingError && err.code === 'FORBIDDEN') {
    return { status: 403, body: { error: 'forbidden', message: err.message } };
  }
  return null;
};

export function registerBillingContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'billing',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: BILLING_EVENTS,
    rbac: BILLING_RBAC,
    routes: { mountAt: '/', build: buildBillingRoutes },
    subscribers: [
      usageRecorderSubscriber({
        listTenantAdmins: listTenantAdminUserIds,
        notify: requestNotification,
      }) as SubscriberDef,
    ],
    errorMapper: billingErrorMapper,
  });

  // Enforcement side of billing: producers call checkBudget(tenantId) from
  // @seta/core; this wires the implementation that reads the Plan 01 counters.
  registerBudgetGuard(createBillingBudgetGuard());
}

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BudgetExceededError,
  type ContributionRegistry,
  type ErrorMapper,
  registerBudgetGuard,
} from '@seta/core';
import type { SubscriberDef } from '@seta/shared-types';
import { createBillingBudgetGuard } from './backend/budget-guard.ts';
import * as schema from './backend/db/schema/index.ts';
import { usageRecorderSubscriber } from './backend/subscribers/usage-recorder.ts';
import { BILLING_EVENTS } from './events.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** Over-budget producers throw BudgetExceededError; surface it as HTTP 402. */
export const billingErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof BudgetExceededError)) return null;
  return {
    status: 402,
    body: { error: 'budget_exceeded', period: err.period, message: 'Tenant AI budget exceeded' },
  };
};

export function registerBillingContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'billing',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: BILLING_EVENTS,
    subscribers: [usageRecorderSubscriber() as SubscriberDef],
    errorMapper: billingErrorMapper,
  });

  // Enforcement side of billing: producers call checkBudget(tenantId) from
  // @seta/core; this wires the implementation that reads the Plan 01 counters.
  registerBudgetGuard(createBillingBudgetGuard());
}

import {
  BILLING_USAGE_OBSERVED,
  BILLING_USAGE_OBSERVED_VERSION,
  type UsageFeature,
} from '@seta/core/events';
import { z } from 'zod';

// The event name/version + the UsageFeature union live in @seta/core/events so
// producers (agent, staffing, the embedding modules) can emit without importing
// @seta/billing. Billing re-exports them and owns the payload validation below.
export { BILLING_USAGE_OBSERVED, BILLING_USAGE_OBSERVED_VERSION, type UsageFeature };

export interface BillingUsageObservedPayload {
  feature: UsageFeature;
  provider: string;
  model_key: string;
  tokens_in: number;
  tokens_out: number;
  /** The user who triggered the call, when known (dashboard top-users). */
  caused_by_user_id: string | null;
}

export const BILLING_USAGE_OBSERVED_PAYLOAD = z.object({
  feature: z.enum(['chat', 'workflow', 'subagent', 'embedding']),
  provider: z.string(),
  model_key: z.string(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  caused_by_user_id: z.string().nullable(),
});

export const BILLING_EVENTS = {
  [BILLING_USAGE_OBSERVED]: BILLING_USAGE_OBSERVED_PAYLOAD,
} as const;

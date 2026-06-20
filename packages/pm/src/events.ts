import { z } from 'zod';

export const accountCreatedPayload = z.object({
  account_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type AccountCreatedPayload = z.infer<typeof accountCreatedPayload>;

export const PM_ACCOUNT_CREATED = 'pm.account.created';

export const PM_EVENTS = {
  'pm.account.created': accountCreatedPayload,
} as const satisfies Record<string, z.ZodSchema>;

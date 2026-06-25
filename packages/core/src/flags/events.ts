import { z } from 'zod';

export const CORE_FEATURE_FLAG_UPDATED = 'core.feature_flag.updated';

export const featureFlagUpdatedPayload = z.object({
  tenant_id: z.string().uuid().nullable(),
  key: z.string(),
});

export const CORE_FEATURE_FLAG_EVENTS = {
  [CORE_FEATURE_FLAG_UPDATED]: featureFlagUpdatedPayload,
} as const satisfies Record<string, z.ZodSchema>;

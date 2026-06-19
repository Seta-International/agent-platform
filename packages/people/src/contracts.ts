import { z } from 'zod';

export const provisionWorkerInput = z.object({
  full_name: z.string().min(1),
  start_date: z.string(), // ISO date, e.g. '2026-06-19'
  employment_type: z.string(),
});
export type ProvisionWorkerInput = z.infer<typeof provisionWorkerInput>;

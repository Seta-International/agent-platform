import { z } from 'zod';

export const provisionWorkerInput = z.object({
  full_name: z.string().min(1),
  start_date: z.string(),
  employment_type: z.string(),
});
export type ProvisionWorkerInput = z.infer<typeof provisionWorkerInput>;

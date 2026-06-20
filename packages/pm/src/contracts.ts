import { z } from 'zod';

export const createAccountInput = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  am_worker_id: z.string().uuid().optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountInput>;

import { z } from 'zod';

export const openRequisitionInput = z.object({
  title: z.string().min(1),
  kind: z.enum(['replacement', 'new']).default('new'),
  role_title: z.string().optional(),
  grade: z.string().optional(),
  account_id: z.string().uuid().optional(),
  resource_request_id: z.string().uuid().optional(),
  position_id: z.string().uuid().optional(),
});
export type OpenRequisitionInput = z.infer<typeof openRequisitionInput>;

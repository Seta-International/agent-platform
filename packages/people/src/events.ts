import { z } from 'zod';

export const workerCreatedPayload = z.object({
  worker_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
export type WorkerCreatedPayload = z.infer<typeof workerCreatedPayload>;

export const PEOPLE_EVENTS = {
  'people.worker.created': workerCreatedPayload,
} as const satisfies Record<string, z.ZodSchema>;

import { z } from 'zod';

export const ThreadSummary = z.object({
  id: z.string(),
  title: z.string().nullable(),
  updatedAt: z.string(),
});
export type ThreadSummary = z.infer<typeof ThreadSummary>;

export const ThreadsResponse = z.object({ threads: z.array(ThreadSummary) });
